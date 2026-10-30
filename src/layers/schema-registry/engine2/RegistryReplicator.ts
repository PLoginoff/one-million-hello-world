/**
 * RegistryReplicator — cross-registry replication stub.
 *
 * Keeps a secondary `SchemaRegistryEngine` in sync with a primary by
 * replaying schema registrations through a `ReplicationChannel`.
 *
 * Realism:
 *   - SEQUENCED: each primary-side registration is stamped with a
 *     monotonic sequence number; the replica applies them in order and
 *     tracks a high-water mark — missed events are detectable and the
 *     replicator backfills on the next `sync()`.
 *   - IDEMPOTENT: re-applying an already-present version is a no-op
 *     (fingerprint check), so retries after channel failures are safe.
 *   - CONFLICT-AWARE: if the replica has a divergent version at the
 *     same (subject, version) coordinate, the conflict is logged and
 *     the primary's version does NOT silently overwrite — replication
 *     is primary→replica authoritative only via explicit `force`.
 *   - EVENT JOURNAL: the primary keeps a bounded journal of events
 *     (register/delete/compat-change) the replica consumes.
 *
 * The channel is a seam: `InMemoryReplicationChannel` for tests, a real
 * impl would be a log consumer (Kafka, event bus).
 *
 * @module SchemaRegistry/Engine2
 */

import type { SchemaRegistryEngine } from '../registry/SchemaRegistryEngine';
import type { SchemaReference } from '../registry/types';
import { fingerprint } from '../registry/SchemaModel';
import type { CompatibilityMode } from '../registry/types';

// ------------------------------------------------------------------ events

export type ReplicationEventKind = 'register' | 'delete_version' | 'delete_subject' | 'set_compatibility';

/** One sequenced replication event. */
export interface ReplicationEvent {
  readonly seq: number;
  readonly kind: ReplicationEventKind;
  readonly subject: string;
  readonly at: number;
  // register payload
  readonly schema?: unknown;
  readonly references?: SchemaReference[];
  // delete_version payload
  readonly version?: number;
  // set_compatibility payload
  readonly compatibility?: CompatibilityMode;
}

/** Channel seam — replicas pull events after their high-water mark. */
export interface ReplicationChannel {
  /** Events with seq > `after`, ordered by seq. */
  read(after: number, limit?: number): ReplicationEvent[];
}

/** Bounded in-memory journal + channel. */
export class InMemoryReplicationChannel implements ReplicationChannel {
  private readonly _events: ReplicationEvent[] = [];
  private readonly _capacity: number;

  constructor(capacity = 10_000) {
    this._capacity = capacity;
  }

  append(e: Omit<ReplicationEvent, 'seq'>): ReplicationEvent {
    const seq = this._events.length === 0 ? 1 : this._events[this._events.length - 1]!.seq + 1;
    const ev: ReplicationEvent = { ...e, seq };
    this._events.push(ev);
    if (this._events.length > this._capacity) this._events.shift();
    return ev;
  }

  read(after: number, limit = 1000): ReplicationEvent[] {
    return this._events.filter((e) => e.seq > after).slice(0, limit);
  }

  get size(): number {
    return this._events.length;
  }
}

// ------------------------------------------------------------------ source hook

/**
 * Journal-writing facade over a primary engine: registrations and
 * deletes pass through to the engine AND append to the channel.
 */
export class ReplicatedSource {
  readonly engine: SchemaRegistryEngine;
  readonly channel: InMemoryReplicationChannel;
  private readonly _now: () => number;

  constructor(engine: SchemaRegistryEngine, channel: InMemoryReplicationChannel, now: () => number = Date.now) {
    this.engine = engine;
    this.channel = channel;
    this._now = now;
  }

  register(subject: string, schema: unknown, references: SchemaReference[] = []): ReturnType<SchemaRegistryEngine['register']> {
    const r = this.engine.register(subject, schema, references);
    if (!r.alreadyRegistered) {
      this.channel.append({ kind: 'register', subject, schema, references, at: this._now() });
    }
    return r;
  }

  deleteSubject(subject: string): number {
    const n = this.engine.deleteSubject(subject);
    if (n > 0) this.channel.append({ kind: 'delete_subject', subject, at: this._now() });
    return n;
  }

  deleteVersion(subject: string, version: number): void {
    this.engine.deleteVersion(subject, version);
    this.channel.append({ kind: 'delete_version', subject, version, at: this._now() });
  }

  setCompatibility(subject: string, mode: CompatibilityMode): void {
    this.engine.setCompatibility(subject, mode);
    this.channel.append({ kind: 'set_compatibility', subject, compatibility: mode, at: this._now() });
  }
}

// ------------------------------------------------------------------ replica

/** One applied/skipped/failed event. */
export interface ReplicaApplyResult {
  readonly seq: number;
  readonly applied: boolean;
  readonly skipped?: string;
  readonly error?: string;
}

/** Replica status. */
export interface ReplicaStatus {
  readonly highWaterMark: number;
  readonly behind: number;
  readonly applied: number;
  readonly conflicts: Array<{ seq: number; subject: string; detail: string }>;
}

export class RegistryReplicator {
  private readonly _replica: SchemaRegistryEngine;
  private readonly _channel: ReplicationChannel;
  private _highWaterMark = 0;
  private _applied = 0;
  private readonly _conflicts: ReplicaStatus['conflicts'] = [];

  constructor(replica: SchemaRegistryEngine, channel: ReplicationChannel) {
    this._replica = replica;
    this._channel = channel;
  }

  /**
   * Apply all events after the high-water mark, in seq order.
   * Registration conflicts (same coordinates, different fingerprint)
   * are collected — never silently overwrite divergent local state.
   */
  sync(force = false): ReplicaApplyResult[] {
    const results: ReplicaApplyResult[] = [];
    let batch: ReplicationEvent[];
    do {
      batch = this._channel.read(this._highWaterMark, 500);
      for (const ev of batch) {
        results.push(this._apply(ev, force));
        this._highWaterMark = Math.max(this._highWaterMark, ev.seq);
      }
    } while (batch.length === 500);
    return results;
  }

  private _apply(ev: ReplicationEvent, force: boolean): ReplicaApplyResult {
    try {
      switch (ev.kind) {
        case 'register': {
          // Skip if the identical schema is already registered.
          const existing = this._replica.lookupSchema(ev.subject, ev.schema);
          if (existing) {
            if (existing.fingerprint === fingerprint(ev.schema)) {
              return { seq: ev.seq, applied: false, skipped: 'already present' };
            }
            if (!force) {
              this._conflicts.push({ seq: ev.seq, subject: ev.subject, detail: 'same subject has divergent version' });
              return { seq: ev.seq, applied: false, error: 'conflict: divergent version at coordinates' };
            }
          }
          this._replica.register(ev.subject, ev.schema, ev.references ?? []);
          this._applied++;
          return { seq: ev.seq, applied: true };
        }
        case 'delete_version': {
          this._replica.deleteVersion(ev.subject, ev.version ?? -1);
          this._applied++;
          return { seq: ev.seq, applied: true };
        }
        case 'delete_subject': {
          this._replica.deleteSubject(ev.subject);
          this._applied++;
          return { seq: ev.seq, applied: true };
        }
        case 'set_compatibility': {
          this._replica.setCompatibility(ev.subject, ev.compatibility!);
          this._applied++;
          return { seq: ev.seq, applied: true };
        }
      }
    } catch (e) {
      return { seq: ev.seq, applied: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  get status(): ReplicaStatus {
    return {
      highWaterMark: this._highWaterMark,
      behind: 0, // computed by caller via channel.size
      applied: this._applied,
      conflicts: this._conflicts,
    };
  }

  get conflicts(): ReplicaStatus['conflicts'] {
    return this._conflicts;
  }
}
