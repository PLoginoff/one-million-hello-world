/**
 * Relay Auditor
 *
 * Cross-checks the operational invariants the relay relies on — the
 * scheduled-health-check half of correctness. `FifoVerifier` proves
 * ordering over the record set; this auditor proves the *store's own*
 * bookkeeping: claims have owners, stale claims get reclaimed, every
 * claimed record's owner actually holds a live partition lease, and
 * no record sits `processing` past its lease window.
 *
 * Checks (each O(R) over the store):
 *   - orphaned-claim    — `processing` records whose owner holds no
 *                         live lease on any partition.
 *   - stale-claim       — `processing` records claimed longer ago than
 *                         the partition's lease duration.
 *   - lease-conflict    — two workers holding claims on the same
 *                         partition (impossible when the election is
 *                         honest; flags the coordinator lying).
 *   - unclaimed-pending — `pending` records older than `warnAgeMs` on
 *                         a partition whose shard contains them —
 *                         backlog forming despite a live leader.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import { LeaderElection } from './LeaderElection';
import { shardOf } from './Sharding';
import { OutboxClock2, SystemOutboxClock2 } from './types';

export type AuditFindingKind =
  | 'orphaned-claim'
  | 'stale-claim'
  | 'lease-conflict'
  | 'unclaimed-pending';

export interface AuditFinding {
  readonly kind: AuditFindingKind;
  readonly detail: string;
  readonly recordIds: readonly string[];
}

export interface AuditRecord extends MetricsRecord {
  readonly claimedBy?: string;
  readonly claimedAt?: number;
}

export function audit(
  records: readonly AuditRecord[],
  election: LeaderElection,
  shardCount: number,
  opts: { leaseMs: number; warnAgeMs?: number; clock?: OutboxClock2 }
): AuditFinding[] {
  const clock = opts.clock ?? new SystemOutboxClock2();
  const now = clock.now();
  const warnAge = opts.warnAgeMs ?? 60_000;
  const findings: AuditFinding[] = [];

  // Who leads each partition right now.
  const leaders = new Map<number, string>();
  for (const g of election.active()) leaders.set(g.partition, g.workerId);

  // Claimed-records index by partition.
  const claimsByPartition = new Map<number, AuditRecord[]>();
  const orphaned: string[] = [];
  const stale: string[] = [];
  const stalestPending = new Map<number, number>();

  for (const r of records) {
    const partition = shardOf(r.aggregateId, shardCount);
    if (r.state === 'processing' && r.claimedBy !== undefined) {
      const list = claimsByPartition.get(partition) ?? [];
      list.push(r);
      claimsByPartition.set(partition, list);
      const holder = leaders.get(partition);
      if (holder !== r.claimedBy) orphaned.push(r.id);
      if (r.claimedAt !== undefined && now - r.claimedAt > opts.leaseMs) {
        stale.push(r.id);
      }
    } else if (r.state === 'pending') {
      const age = now - r.enqueuedAt;
      const cur = stalestPending.get(partition);
      if (age > warnAge && (cur === undefined || r.enqueuedAt < cur)) {
        stalestPending.set(partition, r.enqueuedAt);
      }
    }
  }

  if (orphaned.length > 0) {
    findings.push({
      kind: 'orphaned-claim',
      detail: `${orphaned.length} claimed record(s) whose owner holds no live lease`,
      recordIds: orphaned,
    });
  }
  if (stale.length > 0) {
    findings.push({
      kind: 'stale-claim',
      detail: `${stale.length} claim(s) older than the ${opts.leaseMs}ms lease`,
      recordIds: stale,
    });
  }
  for (const [partition, claims] of claimsByPartition) {
    const workers = new Set(claims.map((r) => r.claimedBy));
    if (workers.size > 1) {
      findings.push({
        kind: 'lease-conflict',
        detail: `partition ${partition} has claims from ${workers.size} workers (${[...workers].join(', ')})`,
        recordIds: claims.map((r) => r.id),
      });
    }
  }
  for (const [partition, enqueuedAt] of stalestPending) {
    if (!leaders.has(partition)) continue; // unled backlog is a different alert
    const ids = records
      .filter((r) => r.state === 'pending' && r.enqueuedAt === enqueuedAt)
      .map((r) => r.id);
    findings.push({
      kind: 'unclaimed-pending',
      detail: `partition ${partition} has a live leader but pending records aged ≥${warnAge}ms`,
      recordIds: ids,
    });
  }
  return findings;
}
