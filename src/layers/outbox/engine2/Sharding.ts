/**
 * Outbox Sharding by Aggregate
 *
 * Partitions records by `aggregateId` so N relay processes can run in
 * parallel without ever splitting one aggregate's FIFO across two
 * workers — the invariant that makes per-aggregate ordering survive
 * concurrency. If every record for aggregate A lands in exactly one
 * shard, then one relay worker owns A's ordering end to end.
 *
 * `shardOf` uses FNV-1a 32-bit over the UTF-8 aggregate id — a real
 * string hash (not `string.charCodeAt` summation) because evenly-
 * distributed shards matter: a bad hash concentrates hot aggregates on
 * one partition and the "parallel" relays convoy. FNV-1a is the
 * standard choice when you need O(len) hashing with avalanche-good
 * dispersion and zero state.
 *
 * `route(entry)` returns the shard for a record; `belongsTo(entry, shard)`
 * is the worker-side gate. `distribution(aggregates, shardCount)`
 * measures balance — the chi-square-ish `max/mean` skew figure an
 * operator checks before adding workers.
 *
 * @module OutboxLayer/Engine2
 */

import { ShardAssignment } from './types';

export class ShardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShardError';
  }
}

/**
 * FNV-1a 32-bit hash of a string, returned unsigned.
 * offset basis 2166136261, prime 16777619 — per-byte multiply-xor.
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // multiply by 16777619 mod 2^32 without float overflow drift:
    // h * 0x01000193 === h + (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24)
    h = (h + ((h << 1) | 0) + ((h << 4) | 0) + ((h << 7) | 0) + ((h << 8) | 0) + ((h << 24) | 0)) | 0;
  }
  return h >>> 0;
}

/** The shard an aggregate id maps to, in `0..shardCount-1`. */
export function shardOf(aggregateId: string, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount <= 0) {
    throw new ShardError(`shardCount must be a positive integer, got ${shardCount}`);
  }
  return fnv1a32(aggregateId) % shardCount;
}

/**
 * Worker-side routing decision. A worker on `shard` processes a record
 * iff `belongsTo` — the same predicate producers and operators use, so
 * there is one definition of "who owns this aggregate".
 */
export function belongsTo(
  aggregateId: string,
  shard: number,
  shardCount: number
): boolean {
  if (!Number.isInteger(shard) || shard < 0 || shard >= shardCount) {
    throw new ShardError(`shard ${shard} is outside 0..${shardCount - 1}`);
  }
  return shardOf(aggregateId, shardCount) === shard;
}

export function assignmentFor(aggregateId: string, shardCount: number): ShardAssignment {
  return { shard: shardOf(aggregateId, shardCount), shardCount };
}

/**
 * Filter a candidate record set to one worker's shard — the per-poll
 * selection a relay applies before claiming. O(R).
 */
export function forShard<T extends { aggregateId: string }>(
  records: readonly T[],
  shard: number,
  shardCount: number
): T[] {
  return records.filter((r) => belongsTo(r.aggregateId, shard, shardCount));
}

/**
 * Balance report: per-shard aggregate counts plus `maxOverMean` — the
 * skew ratio where 1.0 is perfectly even. With random aggregate ids,
 * expect ~1.0–1.3 for reasonable N/shardCount; above ~2 means a hot
 * shard is forming (one relay will starve the others).
 */
export function distribution(
  aggregateIds: readonly string[],
  shardCount: number
): { counts: readonly number[]; maxOverMean: number } {
  const counts = new Array<number>(shardCount).fill(0);
  for (const id of aggregateIds) counts[shardOf(id, shardCount)]++;
  const mean = aggregateIds.length / shardCount;
  const max = Math.max(...counts);
  return { counts, maxOverMean: mean === 0 ? 1 : max / mean };
}
