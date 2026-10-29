/**
 * Scheduler Types
 *
 * Core types for the job scheduler: job definitions (cron or one-shot),
 * retry policy, missed-run strategy, dependencies, and execution records.
 *
 * @module SchedulingLayer/Scheduler
 */

/** A unit of work — the actual function the scheduler invokes. */
export type JobHandler = (ctx: JobContext) => Promise<unknown> | unknown;

/** Context handed to a job at run time. */
export interface JobContext {
  readonly jobId: string;
  /** Which scheduled fire time this execution is for (epoch ms). */
  readonly scheduledAt: number;
  /** Actual dispatch time — differs under backlog/DST catch-up. */
  readonly dispatchedAt: number;
  /** 1-based attempt number for this execution. */
  readonly attempt: number;
}

/** Retry policy applied to a failed execution. */
export interface RetryPolicy {
  readonly maxAttempts: number;
  /** Delay before retry n+1: `baseMs * factor^(n-1)`, capped by maxMs. */
  readonly baseMs: number;
  readonly factor: number;
  readonly maxMs: number;
}

export const NO_RETRY: RetryPolicy = { maxAttempts: 1, baseMs: 0, factor: 1, maxMs: 0 };

/**
 * What to do when the scheduler was down and a recurring job's fire times
 * elapsed without running:
 *   skip-all   — jump to the next future fire time (most jobs)
 *   skip-one   — run once for the most recent missed slot
 *   run-all    — run once per missed slot (catch-up / backfill)
 */
export type MissedRunPolicy = 'skip-all' | 'skip-one' | 'run-all';

/** A registered job. */
export interface JobDefinition {
  readonly jobId: string;
  readonly handler: JobHandler;
  /** Cron expression (recurring) or a one-shot fire time. */
  readonly schedule:
    | { readonly kind: 'cron'; readonly expr: string }
    | { readonly kind: 'once'; readonly at: number };
  readonly priority?: number;
  readonly timeoutMs?: number;
  readonly retry?: RetryPolicy;
  readonly missedRunPolicy?: MissedRunPolicy;
  /** Max concurrent executions of THIS job (default 1). */
  readonly concurrency?: number;
  /** Jobs that must complete before this one may fire. */
  readonly dependsOn?: readonly string[];
}

/** Runtime state for one registered job. */
export interface ScheduledJob {
  readonly def: JobDefinition;
  /** Next fire time (epoch ms), or null if disabled/exhausted. */
  nextFireAt: number | null;
  /** Currently running executions (for concurrency limit). */
  running: number;
  /** Fire times that elapsed while the job was blocked (missed-run handling). */
  missedSlots: number[];
  /** Total executions started. */
  executions: number;
  /** Last execution outcome. */
  lastStatus: ExecutionStatus | null;
  /** When the job last dispatched — drives missed-slot backfill. */
  lastDispatchAt?: number;
  enabled: boolean;
}

export type ExecutionStatus = 'success' | 'failure' | 'timeout' | 'cancelled';

/** One execution record for observability. */
export interface ExecutionRecord {
  readonly executionId: string;
  readonly jobId: string;
  readonly scheduledAt: number;
  readonly startedAt: number;
  finishedAt: number | null;
  status: ExecutionStatus | 'running';
  attempt: number;
  error?: string;
  /** Job result payload on success. */
  result?: unknown;
}

/** Injectable clock. */
export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class SchedulerError extends Error {
  constructor(
    public readonly code:
      | 'JOB_NOT_FOUND'
      | 'DUPLICATE_JOB'
      | 'INVALID_JOB'
      | 'INVALID_CRON'
      | 'CYCLE'
      | 'DEP_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'SchedulerError';
  }
}
