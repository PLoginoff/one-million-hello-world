/**
 * Shard Rebalancing
 *
 * When `shardCount` changes (adding relay capacity), every aggregate
 * re-hashes — but mid-flight records must not silently swap owners
 * or ordering breaks. This planner computes the migration safely:
 *
 *   - `moves` — aggregates whose shard changes between `from` and
 *     `to` shard counts, with both the old and new owner.
 *   - `hotSpots` — shards whose moved-in share of the tracked
 *     aggregates exceeds `hotShare` of the set (a bad spread — a
 *     resize that concentrates load isn't a resize).
 *
 * An aggregate in `moves` is safe to re-key only when its live
 * sequence is fully `sent` (no pending/processing/failed records) —
 * the same invariant `backfill` enforces for the same reason.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import { shardOf } from './Sharding';

export interface AggregateMove {
  readonly aggregateId: string;
  readonly fromShard: number;
  readonly toShard: number;
  /**
   * True when the aggregate has no unfinished records — it may re-key
   * immediately. False means drain first.
   */
  readonly safeNow: boolean;
}

export interface RebalancePlan {
  readonly moves: readonly AggregateMove[];
  readonly stayed: readonly string[];
  /** Aggregates still holding unfinished work (must drain before re-key). */
  readonly blocked: readonly string[];
  /** New-shard distribution of all tracked aggregates. */
  readonly newCounts: readonly number[];
}

const UNFINISHED = new Set<MetricsRecord['state']>(['pending', 'processing', 'failed']);

export function planRebalance(
  records: readonly MetricsRecord[],
  fromCount: number,
  toCount: number,
  hotShare = 0.5
): RebalancePlan & { hotSpots: readonly number[] } {
  const byAggregate = new Map<string, { finished: boolean }>();
  for (const r of records) {
    const e = byAggregate.get(r.aggregateId) ?? { finished: true };
    if (UNFINISHED.has(r.state)) e.finished = false;
    byAggregate.set(r.aggregateId, e);
  }

  const moves: AggregateMove[] = [];
  const stayed: string[] = [];
  const blocked: string[] = [];
  const newCounts = new Array<number>(toCount).fill(0);
  for (const [aggregateId, info] of byAggregate) {
    const to = shardOf(aggregateId, toCount);
    newCounts[to]++;
    const from = shardOf(aggregateId, fromCount);
    if (to === from) {
      stayed.push(aggregateId);
      continue;
    }
    moves.push({ aggregateId, fromShard: from, toShard: to, safeNow: info.finished });
    if (!info.finished) blocked.push(aggregateId);
  }

  const threshold = Math.ceil(byAggregate.size * hotShare);
  const hotSpots = newCounts
    .map((count, shard) => ({ count, shard }))
    .filter((c) => c.count > threshold)
    .map((c) => c.shard);

  return { moves, stayed, blocked, newCounts, hotSpots };
}
