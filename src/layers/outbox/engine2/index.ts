/**
 * Outbox Engine2 — public exports.
 *
 * @module OutboxLayer/Engine2
 */

export * from './types';
export { shardOf, belongsTo, assignmentFor, forShard, distribution, fnv1a32, ShardError } from './Sharding';
export { LeaderElection, LeadershipError } from './LeaderElection';
export { OutboxMetrics } from './Metrics';
export type { MetricsRecord } from './Metrics';
export { verify, verifyDispatch } from './FifoVerifier';
export { OutboxCleaner } from './Cleanup';
export { RelayLoop } from './RelayLoop';
export type { RelayStore, Dispatcher, PollOutcome } from './RelayLoop';
export { backfill } from './Backfill';
export type { BackfillPlan, BackfillResult } from './Backfill';
export { audit } from './RelayAuditor';
export type { AuditFinding, AuditFindingKind, AuditRecord } from './RelayAuditor';
export { planRebalance } from './ShardRebalancer';
export type { AggregateMove, RebalancePlan } from './ShardRebalancer';
export { schedule } from './PriorityScheduler';
export type { PriorityPolicy, PrioritizedRecord, PrioritizableRecord } from './PriorityScheduler';
