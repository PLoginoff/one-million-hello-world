/**
 * Archive Backfill
 *
 * Re-dispatching archived records — the "re-run yesterday's events"
 * path after a downstream consumer bug is fixed. The archive is cold
 * storage; a backfill moves a selected window of archived records back
 * to live `pending` so the normal relay path redelivers them.
 *
 * Safety constraints enforced here (each is a footgun otherwise):
 *   - Only aggregates whose whole live sequence is already `sent`
 *     accept backfill — injecting an old seq into a live aggregate
 *     would create a seq hole the FIFO gate can never close.
 *   - Records re-enter with `aggregateSeq` REBASED past the
 *     aggregate's current max — backfill is a replay, not a rewrite
 *     of history, so redeliveries must not collide with live seqs.
 *   - Batches cap at `limit` per run; ordering is enqueuedAt order so
 *     the replay arrives in the same sequence it originally went.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import { OutboxCleaner } from './Cleanup';

export interface BackfillPlan {
  readonly aggregateId?: string;
  /** Only archive records enqueued inside [from, to] (clock values). */
  readonly from?: number;
  readonly to?: number;
  /** Cap on records moved per call. */
  readonly limit: number;
}

export interface BackfillResult {
  readonly moved: readonly MetricsRecord[];
  /** Records matched by the plan but skipped (aggregate still live). */
  readonly blocked: readonly string[];
  readonly remaining: number;
}

let backfillSeq = 0;

/**
 * Plan and execute a backfill against `cleaner`'s archive, inserting
 * into `insert` (the live store). Records are re-based past each
 * aggregate's max live seq and get fresh ids so idempotency keys
 * downstream see them as distinct sends.
 */
export function backfill(
  cleaner: OutboxCleaner,
  insert: (record: MetricsRecord) => void,
  liveRecords: readonly MetricsRecord[],
  plan: BackfillPlan
): BackfillResult {
  // Seed each aggregate's high-watermark from BOTH live and archive —
  // a rebased backfill must land past every seq the aggregate ever
  // used, or the replay collides with history.
  const maxSeqByAggregate = new Map<string, number>();
  const bump = (aggregateId: string, seq: number): void => {
    const cur = maxSeqByAggregate.get(aggregateId);
    if (cur === undefined || seq > cur) maxSeqByAggregate.set(aggregateId, seq);
  };
  for (const r of liveRecords) bump(r.aggregateId, r.aggregateSeq);

  const archived = cleaner.archived();
  for (const r of archived) bump(r.aggregateId, r.aggregateSeq);
  const matches = archived.filter(
    (r) =>
      (plan.aggregateId === undefined || r.aggregateId === plan.aggregateId) &&
      (plan.from === undefined || r.enqueuedAt >= plan.from) &&
      (plan.to === undefined || r.enqueuedAt <= plan.to)
  );

  const moved: MetricsRecord[] = [];
  const blocked: string[] = [];
  for (const rec of matches.slice(0, plan.limit)) {
    // Skip aggregates that still have live (non-sent) records: backfill
    // into a live aggregate would create an unclosable seq hole.
    const liveForAggregate = liveRecords.filter(
      (r) => r.aggregateId === rec.aggregateId && r.state !== 'sent' && r.state !== 'archived'
    );
    if (liveForAggregate.length > 0) {
      blocked.push(rec.id);
      continue;
    }
    const base = (maxSeqByAggregate.get(rec.aggregateId) ?? -1) + 1;
    const rebased: MetricsRecord = {
      id: `${rec.id}.bf${++backfillSeq}`,
      aggregateId: rec.aggregateId,
      aggregateSeq: base,
      destination: rec.destination,
      type: rec.type,
      payload: rec.payload,
      enqueuedAt: rec.enqueuedAt,
      state: 'pending',
    };
    maxSeqByAggregate.set(rec.aggregateId, base);
    insert(rebased);
    moved.push(rebased);
  }

  const remaining = matches.length - moved.length - blocked.length;
  return { moved, blocked, remaining };
}
