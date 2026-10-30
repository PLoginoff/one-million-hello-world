/**
 * Scheduling Engine2 — public exports.
 *
 * Second-generation machinery on top of `scheduler/`:
 *   - DependencyDAG             — topo layers, critical path, impact sets
 *   - PreemptiveQueue           — priority + aging + slot preemption
 *   - DedupLedger               — one-execution-per-(job,slot) dedup
 *   - RetryBudget/DeadlinePolicy— retry storms + deadline windows
 *   - ResourceConflictDetector  — shared-resource overlap + lookahead
 *
 * @module SchedulingLayer/Engine2
 */

export { DependencyDAG, CycleError } from './DependencyDAG';
export type { DagJob, CriticalPath } from './DependencyDAG';

export { PreemptiveQueue } from './PreemptiveQueue';
export type {
  QueuedJob,
  RunningJob,
  PreemptedJob,
  PreemptiveQueueOptions,
} from './PreemptiveQueue';

export { DedupLedger } from './DedupLedger';
export type { ClaimStatus, ClaimRecord, DedupLedgerOptions } from './DedupLedger';

export { RetryBudget, DeadlinePolicy, backoffDelay } from './RetryPolicyEngine';
export type { RetryDecision, RetryDeny } from './RetryPolicyEngine';

export { ResourceConflictDetector } from './ResourceConflicts';
export type {
  ResourceJob,
  ResourceConflict,
  WindowConflict,
  FireWindow,
} from './ResourceConflicts';

export { FairShareScheduler } from './FairShareScheduler';
export type { TenantJob, FairShareOptions } from './FairShareScheduler';
