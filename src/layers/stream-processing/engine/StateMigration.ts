/**
 * StateMigration — move operator state when the topology changes.
 *
 * Scaling a stream job from P to P' partitions isn't just "spawn more
 * tasks": every keyed entry must move to the partition that will own
 * its key under the NEW assignment, or the job silently computes wrong
 * results (a key's windows split across two tasks). This module is the
 * rescue plan between checkpoint restore and resume:
 *
 *   snapshot all namespaces (old assignment)
 *     → rehash every key to its new partition
 *     → restore into the new topology
 *     → verify: every source entry landed somewhere, per-key content
 *       unchanged
 *
 * Window state complicates this: window cells are keyed by
 * (entityKey, windowStart) — a composite. Rescaling must hash only the
 * entityKey part, or two events that belong to the SAME window could
 * land on different partitions and produce duplicate/partial results.
 * `WindowStateCodec` encodes/decodes the composite so migrators can
 * split it correctly — the same reason Kafka Streams prefixes its
 * window-store keys.
 *
 * @module StreamProcessing/Engine
 */

import { KeyedStateBackend, BackendSnapshot, StateValue } from './StateBackend';

// ---------------------------------------------------------------------
// Partition assignment
// ---------------------------------------------------------------------

/** Stable key→partition function. Deterministic across old & new topologies
 *  (same input, same hash — only the modulus changes). */
export type PartitionAssigner = (key: string, partitionCount: number) => number;

/** FNV-1a % partitions — the default, same hash family as the rest of the
 *  codebase so partition assignment is consistent with stream routing. */
export function fnvAssigner(key: string, partitionCount: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h >>> 0) % partitionCount;
}

// ---------------------------------------------------------------------
// Key codecs — how a composite state key splits into (entity, qualifier)
// ---------------------------------------------------------------------

/**
 * Split a stored key into the entity part (what partitioning hashes)
 * and the qualifier (window start, join side, dedup seq...).
 *
 * Window stores MUST override the naive "hash the whole key" behaviour:
 * `order-1|1700000000000` and `order-1|1700000600000` are the same entity
 * in different windows and must live on the same partition.
 */
export interface StateKeyCodec {
  /** The partitionable entity portion of a stored key. */
  entityOf(storedKey: string): string;
  /** Rebuild a stored key from entity + qualifier (migration rewrite). */
  compose(entity: string, qualifier: string): string;
  /** Split a stored key — inverse of compose. */
  split(storedKey: string): { entity: string; qualifier: string };
}

/** Plain keys: entity == whole key. */
export const PlainKeyCodec: StateKeyCodec = {
  entityOf: (k) => k,
  compose: (entity, qualifier) => (qualifier ? `${entity}|${qualifier}` : entity),
  split: (k) => ({ entity: k, qualifier: '' }),
};

/**
 * Windowed keys: `entity|windowStart` — the `|` separator matches
 * `WindowedAggregate._windowKey` so migrators can read its keyspace.
 */
export const WindowKeyCodec: StateKeyCodec = {
  entityOf: (k) => {
    const i = k.lastIndexOf('|');
    return i === -1 ? k : k.slice(0, i);
  },
  compose: (entity, qualifier) => `${entity}|${qualifier}`,
  split: (k) => {
    const i = k.lastIndexOf('|');
    if (i === -1) return { entity: k, qualifier: '' };
    return { entity: k.slice(0, i), qualifier: k.slice(i + 1) };
  },
};

// ---------------------------------------------------------------------
// Migration report
// ---------------------------------------------------------------------

export interface MigratedNamespace {
  readonly namespace: string;
  readonly entriesTotal: number;
  /** Entries whose entity remapped to a different partition. */
  readonly entriesMoved: number;
  /** new partition -> entries it received. */
  readonly perPartition: Map<number, number>;
}

export interface MigrationReport {
  readonly fromPartitions: number;
  readonly toPartitions: number;
  readonly namespaces: MigratedNamespace[];
  /** Total entries moved across all namespaces. */
  readonly totalMoved: number;
  /** Entries that could not be re-homed (always 0 on success — kept for API stability). */
  readonly orphans: { namespace: string; key: string }[];
  readonly elapsedMs: number;
}

// ---------------------------------------------------------------------
// Migrator
// ---------------------------------------------------------------------

export class StateMigrationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'StateMigrationError';
  }
}

export class StateMigrator {
  private readonly _assigner: PartitionAssigner;
  private readonly _now: () => number;

  constructor(assigner: PartitionAssigner = fnvAssigner, now: () => number = Date.now) {
    this._assigner = assigner;
    this._now = now;
  }

  /**
   * Rescale `backend`'s namespaces from `oldPartitions` to `newPartitions`.
   *
   * Algorithm: for each namespace, snapshot → clear → re-put every entry
   * at `assigner(entityOf(key), newPartitions)`. Entries whose assignment
   * is unchanged are rewritten in place (cheap — no data copy needed on
   * the in-memory backend, and one WAL append on the LSM one).
   *
   * `codecs` maps namespace → key codec; unknown namespaces default to
   * `PlainKeyCodec` (entity = whole key).
   */
  rescale(
    backend: KeyedStateBackend,
    namespaces: readonly string[],
    oldPartitions: number,
    newPartitions: number,
    codecs: Record<string, StateKeyCodec> = {}
  ): MigrationReport {
    const start = this._now();
    if (newPartitions < 1) throw new StateMigrationError('newPartitions must be >= 1');
    const reports: MigratedNamespace[] = [];
    const orphans: { namespace: string; key: string }[] = [];
    let totalMoved = 0;

    for (const ns of namespaces) {
      const codec = codecs[ns] ?? PlainKeyCodec;
      backend.registerNamespace(ns);
      const snap = backend.snapshot(ns);
      // Clear the namespace's old partitions (but keep the namespace).
      for (const p of backend.partitions(ns)) {
        for (const [k] of backend.entries(ns, p)) backend.delete(ns, p, k);
      }

      let moved = 0;
      const perPartition = new Map<number, number>();
      for (const e of snap.entries) {
        if (e.partition < 0 || e.partition >= oldPartitions) {
          // Entry claims a partition outside the old topology — a corrupt
          // snapshot or a half-finished previous migration. Surface it.
          orphans.push({ namespace: ns, key: e.key });
          continue;
        }
        const entity = codec.entityOf(e.key);
        const newP = this._assigner(entity, newPartitions);
        backend.put(ns, newP, e.key, e.value);
        perPartition.set(newP, (perPartition.get(newP) ?? 0) + 1);
        if (newP !== e.partition) moved++;
      }
      totalMoved += moved;
      reports.push({
        namespace: ns,
        entriesTotal: snap.entries.length,
        entriesMoved: moved,
        perPartition,
      });
    }

    return {
      fromPartitions: oldPartitions,
      toPartitions: newPartitions,
      namespaces: reports,
      totalMoved,
      orphans,
      elapsedMs: this._now() - start,
    };
  }

  /**
   * Post-migration invariant check — cheap proof the move was sound:
   *   1. every snapshot entry exists under its new partition
   *   2. value bytes are identical (ByteBuffer comparison)
   *   3. no entry landed on the wrong partition per the assigner
   *
   * Returns the violations — empty means the migration is verifiably
   * correct, not just "probably fine".
   */
  verify(
    backend: KeyedStateBackend,
    ns: string,
    source: BackendSnapshot,
    newPartitions: number,
    codec: StateKeyCodec = PlainKeyCodec
  ): string[] {
    const violations: string[] = [];
    const byKey = new Map<string, StateValue>();
    for (const e of source.entries) byKey.set(e.key, e.value);

    // (1)+(2): every source entry landed, bytes intact.
    const seen = new Set<string>();
    for (const p of backend.partitions(ns)) {
      for (const [k, v] of backend.entries(ns, p)) {
        seen.add(k);
        const src = byKey.get(k);
        if (src === undefined) {
          violations.push(`key '${k}' exists in target but not in source snapshot`);
          continue;
        }
        if (src.length !== v.length || !src.every((b, i) => b === v[i])) {
          violations.push(`key '${k}': value bytes differ after migration`);
        }
        // (3): correct partition.
        const want = this._assigner(codec.entityOf(k), newPartitions);
        if (p !== want) {
          violations.push(`key '${k}' on partition ${p}, assigner says ${want}`);
        }
      }
    }
    for (const e of source.entries) {
      if (!seen.has(e.key)) violations.push(`key '${e.key}' lost during migration`);
    }
    return violations;
  }

  /**
   * Window-state-specific helper: migrate only entries belonging to a
   * window range — used when a topology change coincides with a window
   * boundary reset (rare but real: "keep only open windows").
   */
  migrateWindowRange(
    backend: KeyedStateBackend,
    ns: string,
    keepWindows: (windowStart: number, windowEnd: number) => boolean,
    newPartitions: number,
    codec: StateKeyCodec = WindowKeyCodec
  ): { kept: number; dropped: number } {
    backend.registerNamespace(ns);
    const snap = backend.snapshot(ns);
    let kept = 0;
    let dropped = 0;
    for (const p of backend.partitions(ns)) {
      for (const [k] of backend.entries(ns, p)) backend.delete(ns, p, k);
    }
    for (const e of snap.entries) {
      const { qualifier } = codec.split(e.key);
      const start = Number(qualifier);
      // If the qualifier isn't a window start, conservatively keep.
      if (Number.isFinite(start) && !keepWindows(start, start + 1)) {
        dropped++;
        continue;
      }
      backend.put(ns, this._assigner(codec.entityOf(e.key), newPartitions), e.key, e.value);
      kept++;
    }
    return { kept, dropped };
  }
}
