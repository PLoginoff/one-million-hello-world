/**
 * Priority-Aware Claim Scheduler
 *
 * When a relay can't dispatch everything it owns, which pending
 * records go first? The naive answer (enqueuedAt FIFO) starves urgent
 * types under a backlog; a pure priority queue inverts that — low-
 * priority records never move. This scheduler interleaves them with
 * weighted-fair-ish aging:
 *
 *   effectiveScore = priority·priorityWeight + ageMs·ageWeight
 *
 * A waiting record gains score linearly with age, so nothing starves;
 * high-priority records still jump the queue at enqueue time.
 * Ordering inside a score tie falls back to per-aggregate FIFO (the
 * safety rule the rest of the engine already enforces).
 *
 * Cost: O(R) score computation + O(R log R) sort per batch — the
 * claim-size the relay asks for bounds the sorted prefix.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import { OutboxClock2, SystemOutboxClock2 } from './types';

export interface PriorityPolicy {
  /** Points per priority unit (record.priority ∈ [0..]). */
  readonly priorityWeight: number;
  /** Points per ms of queue age (aging rate). */
  readonly ageWeight: number;
}

const DEFAULT_POLICY: PriorityPolicy = {
  priorityWeight: 100,
  ageWeight: 0.01,
};

export interface PrioritizedRecord {
  readonly record: MetricsRecord;
  readonly score: number;
  readonly priority: number;
  readonly ageMs: number;
}

/** Extend the entry shape with an optional priority hint (0 default). */
export type PrioritizableRecord = MetricsRecord & { priority?: number };

/**
 * Order a pending set by effective score desc, ties broken by
 * enqueuedAt asc — old records never lose to new arrivals on equal
 * priority.
 */
export function schedule(
  records: readonly PrioritizableRecord[],
  clock: OutboxClock2 = new SystemOutboxClock2(),
  policy: PriorityPolicy = DEFAULT_POLICY,
  limit = 100
): PrioritizedRecord[] {
  const now = clock.now();
  const scored = records.map((r) => {
    const ageMs = now - r.enqueuedAt;
    const priority = r.priority ?? 0;
    return {
      record: r,
      score: priority * policy.priorityWeight + ageMs * policy.ageWeight,
      priority,
      ageMs,
    };
  });
  scored.sort(
    (a, b) => b.score - a.score || a.record.enqueuedAt - b.record.enqueuedAt
  );
  return scored.slice(0, limit);
}
