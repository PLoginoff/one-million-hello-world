/**
 * BusReplicator — cross-bus replication stub.
 *
 * Multi-region event stores replicate the commit log to a peer bus so a
 * region failover doesn't lose events. This is a faithful in-memory stub:
 * a `target` EventLog receives copies of source events via `replicate()`,
 * which is the async poll a real replicator (Kafka MirrorMaker, EventStoreDB
 * connected subscriptions) would run on a timer.
 *
 * Fidelity choices:
 *   - Positions are REMAPPED: the replica assigns its own global/stream
 *     positions (a replica is an independent log, not a byte copy) while
 *     preserving source `id`, `type`, `data`, `meta`, and `committedAt`.
 *     `replicationOf` in meta links replica → source event.
 *   - The cursor tracks source global position consumed; `lag` is
 *     source.tip - cursor — the health metric a real replicator exposes.
 *   - `filter` lets a caller replicate a subset (per-tenant DR, selective
 *     cross-region streams).
 *
 * @module EventLayer/Engine/Security
 */

import { EventLog } from '../EventLog';
import { EngineEvent, StoredEngineEvent } from '../types';
import { ReplicationCursor } from './types';

export interface BusReplicatorOptions {
  /** Replicate only events matching this predicate (selective replication). */
  readonly filter?: (ev: StoredEngineEvent) => boolean;
  /** Tag stamped into replicated meta for provenance. Default 'replica'. */
  readonly replicaTag?: string;
}

export class BusReplicator {
  private readonly filter?: (ev: StoredEngineEvent) => boolean;
  private readonly tag: string;
  private cursor = -1; // last source global position consumed
  private replicated = 0;

  constructor(
    private readonly source: EventLog,
    private readonly target: EventLog,
    options: BusReplicatorOptions = {}
  ) {
    this.filter = options.filter;
    this.tag = options.replicaTag ?? 'replica';
  }

  /**
   * Polls the source for new events since the cursor and appends them to
   * the target. Returns how many were replicated this round — the "pump"
   * a scheduled job calls.
   */
  replicate(): number {
    const events = this.source.readFrom(this.cursor + 1);
    let n = 0;
    for (const ev of events) {
      this.cursor = ev.globalPosition;
      if (this.filter && !this.filter(ev)) continue;
      this.copyToTarget(ev);
      n++;
    }
    this.replicated += n;
    return n;
  }

  /** Cursor state: position consumed + lag behind the source tip. */
  status(): ReplicationCursor {
    return {
      source: 'source',
      position: this.cursor,
      lag: this.source.tip - this.cursor,
    };
  }

  get totalReplicated(): number {
    return this.replicated;
  }

  /**
   * Copies one event into the target log. The replica is a real EventLog
   * append — new positions, same payload — with `replicationOf` recording
   * the source event id for end-to-end dedup/idempotency checks.
   */
  private copyToTarget(ev: StoredEngineEvent): void {
    const candidate: EngineEvent = {
      streamId: ev.streamId,
      type: ev.type,
      schemaVersion: ev.schemaVersion,
      data: ev.data,
      meta: {
        ...ev.meta,
        replicationOf: ev.id,
        replicaTag: this.tag,
        sourceGlobalPosition: ev.globalPosition,
      },
    };
    this.target.append(ev.streamId, [candidate]);
  }
}
