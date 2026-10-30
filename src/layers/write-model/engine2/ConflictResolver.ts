/**
 * ConflictResolver — LWW / FWW / merge strategies for concurrent writes.
 *
 * Two writers race on the same field: who wins? Three strategies cover
 * the real cases:
 *
 *  - last-write-wins (LWW): later timestamp wins; simple but loses the
 *    earlier write's data. Wall-clock skew is the known hazard — we
 *    break ties by writerId for determinism.
 *  - first-write-wins (FWW): earlier timestamp wins — used for
 *    create-once semantics (idempotent creates, one-shot claims).
 *  - merge: field-level or CRDT-ish combination — e.g. counters add,
 *    sets union, maps merge per-field (per-field winner determined by
 *    the same LWW/FWW rule unless a merge fn is given).
 *
 * Conflicts are detected via version vectors per writer: a write
 * conflicts with another when neither dominates the other (concurrent
 * edits). Dominating writes apply directly — no conflict to resolve.
 *
 * @module WriteModelLayer/Engine2
 */

export type ConflictStrategy = 'lww' | 'fww' | 'merge';

export interface Write {
  readonly writerId: string;
  /** Lamport-ish timestamp (or wall ms) of the write. */
  readonly timestampMs: number;
  /** Field values written. */
  readonly fields: Record<string, unknown>;
  /** Per-writer sequence for ordering (breaks timestamp ties). */
  readonly seq: number;
}

export interface ConflictReport {
  readonly field: string;
  readonly strategy: ConflictStrategy;
  /** Values seen and the winner. */
  readonly winner: string;
  readonly loser: string;
}

export type MergeFn = (a: unknown, b: unknown) => unknown;

/**
 * Resolve concurrent writes on the same field set.
 * `writes` are concurrent edits to one aggregate (same base version).
 * Returns merged fields plus per-field conflict reports.
 */
export function resolveConflicts(
  writes: readonly Write[],
  strategy: ConflictStrategy = 'lww',
  fieldMergers: Record<string, MergeFn> = {}
): { fields: Record<string, unknown>; conflicts: ConflictReport[] } {
  const fields: Record<string, unknown> = {};
  const conflicts: ConflictReport[] = [];
  // Sort writes deterministically: timestamp asc, then writerId, then seq.
  const sorted = [...writes].sort(
    (a, b) => a.timestampMs - b.timestampMs || a.writerId.localeCompare(b.writerId) || a.seq - b.seq
  );
  const allFields = new Set<string>();
  for (const w of sorted) for (const f of Object.keys(w.fields)) allFields.add(f);

  for (const field of allFields) {
    const writers = sorted.filter((w) => field in w.fields);
    if (writers.length === 1) {
      fields[field] = writers[0].fields[field];
      continue;
    }
    const merger = fieldMergers[field];
    if (strategy === 'merge' && merger) {
      let acc = writers[0].fields[field];
      for (const w of writers.slice(1)) acc = merger(acc, w.fields[field]);
      fields[field] = acc;
      conflicts.push({ field, strategy: 'merge', winner: 'merged', loser: 'n/a' });
      continue;
    }
    const winner = strategy === 'fww' ? writers[0] : writers[writers.length - 1];
    const loser = strategy === 'fww' ? writers[writers.length - 1] : writers[0];
    fields[field] = winner.fields[field];
    conflicts.push({
      field,
      strategy,
      winner: `${winner.writerId}@${winner.timestampMs}`,
      loser: `${loser.writerId}@${loser.timestampMs}`,
    });
  }
  return { fields, conflicts };
}

/** Built-in merge helpers for the 'merge' strategy. */
export const mergers: Record<string, MergeFn> = {
  /** Counters/tallies: additive. */
  sum: (a, b) => Number(a ?? 0) + Number(b ?? 0),
  /** Sets: union. */
  union: (a, b) => [...new Set([...(a as unknown[] ?? []), ...(b as unknown[] ?? [])])],
  /** Max value (monotonic counters, watermarks). */
  max: (a, b) => Math.max(Number(a ?? -Infinity), Number(b ?? -Infinity)),
  /** Min value. */
  min: (a, b) => Math.min(Number(a ?? Infinity), Number(b ?? Infinity)),
  /** Shallow record merge — later keys win. */
  shallow: (a, b) => ({ ...(a as object ?? {}), ...(b as object ?? {}) }),
};

/**
 * Detect whether two writes are concurrent (neither's version vector
 * dominates). writes carry a vector clock: writerId→seq.
 */
export function isConcurrent(a: Record<string, number>, b: Record<string, number>): boolean {
  let aDom = false;
  let bDom = false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;
    if (av > bv) aDom = true;
    else if (bv > av) bDom = true;
  }
  return aDom && bDom; // both dominate somewhere → concurrent
}
