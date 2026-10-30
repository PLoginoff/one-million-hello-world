/**
 * Per-Aggregate FIFO Verification
 *
 * Audits a record set for ordering violations — the proof a relay's
 * ordering promise actually held. Per aggregate, sequences must be
 * contiguous from 0 (a gap means a missing/skipped record), unique (a
 * duplicate seq means a double-enqueue), and no `sent` record may sit
 * ahead of a still-pending earlier seq (an inversion — the relay sent
 * out of order).
 *
 * Verification is per-aggregate by construction: nothing orders
 * records across aggregates, so cross-aggregate seq comparisons are
 * meaningless noise and skipped.
 *
 * Cost: one O(R) pass to bucket by aggregate, then O(R_a) per
 * aggregate on a seq-sorted walk — the same per-aggregate view the
 * relay maintains.
 *
 * `verify` audits stored state; `verifyDispatch` checks an emitted
 * stream (what the relay actually sent, in send order) for the same
 * per-aggregate monotonicity — the two views catch different bugs
 * (store corruption vs. relay logic errors).
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import { OrderReport, OrderViolation } from './types';

export function verify(records: readonly MetricsRecord[]): OrderReport {
  const byAggregate = new Map<string, MetricsRecord[]>();
  for (const r of records) {
    const list = byAggregate.get(r.aggregateId) ?? [];
    list.push(r);
    byAggregate.set(r.aggregateId, list);
  }

  const violations: OrderViolation[] = [];
  for (const [aggregateId, recs] of byAggregate) {
    recs.sort((a, b) => a.aggregateSeq - b.aggregateSeq);

    // Duplicate sequences.
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      const cur = recs[i];
      if (prev && cur && prev.aggregateSeq === cur.aggregateSeq) {
        violations.push({
          kind: 'duplicate',
          aggregateId,
          seq: cur.aggregateSeq,
          ids: recs.filter((r) => r.aggregateSeq === cur.aggregateSeq).map((r) => r.id),
        });
      }
    }

    // Gaps: walk expected 0..n; any jump is a missing seq.
    // A gap is only a violation when a *live* record (pending/
    // processing/failed) sits beyond it — a tail gap means the producer
    // skipped a seq, which is exactly what the audit exists to catch.
    let expected = 0;
    for (const r of recs) {
      if (r.aggregateSeq > expected) {
        violations.push({
          kind: 'gap',
          aggregateId,
          expected,
          found: r.aggregateSeq,
        });
      }
      expected = r.aggregateSeq + 1;
    }

    // Inversions: a sent record while an earlier seq is still
    // pending/processing/failed (i.e. the earlier one has not made it).
    const maxUnsettled = new Set<number>();
    for (const r of recs) {
      if (r.state === 'pending' || r.state === 'processing' || r.state === 'failed') {
        maxUnsettled.add(r.aggregateSeq);
      }
    }
    if (maxUnsettled.size > 0) {
      const earliestUnsettled = Math.min(...maxUnsettled);
      for (const r of recs) {
        if (r.state === 'sent' && r.aggregateSeq > earliestUnsettled) {
          violations.push({
            kind: 'inversion',
            aggregateId,
            sentSeq: r.aggregateSeq,
            pendingSeq: earliestUnsettled,
          });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    aggregatesChecked: byAggregate.size,
  };
}

/**
 * Verify an emitted stream: seqs per aggregate must be non-decreasing
 * in send order (sent in-order ⇒ strictly increasing; dedup redelivery
 * of an earlier seq would be a re-send, which is a violation here
 * because the stream is the logical send log, not physical retries).
 */
export function verifyDispatch(
  sent: readonly { aggregateId: string; aggregateSeq: number }[]
): OrderReport {
  const lastSeq = new Map<string, number>();
  const violations: OrderViolation[] = [];
  const aggregates = new Set<string>();
  for (const s of sent) {
    aggregates.add(s.aggregateId);
    const prev = lastSeq.get(s.aggregateId);
    if (prev !== undefined && s.aggregateSeq <= prev) {
      violations.push({
        kind: 'inversion',
        aggregateId: s.aggregateId,
        sentSeq: s.aggregateSeq,
        pendingSeq: prev,
      });
    }
    lastSeq.set(s.aggregateId, s.aggregateSeq);
  }
  return {
    ok: violations.length === 0,
    violations,
    aggregatesChecked: aggregates.size,
  };
}
