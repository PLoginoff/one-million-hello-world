/**
 * Job Executor
 *
 * Runs one job attempt with timeout and retry. Timeout uses a racing
 * Promise — the handler still runs to completion in the background, but
 * the record is marked 'timeout' so the scheduler treats it as failed.
 *
 * Retries follow the job's {@link RetryPolicy} with exponential backoff;
 * each attempt gets its own execution record so history is preserved.
 *
 * @module SchedulingLayer/Scheduler
 */

import {
  Clock,
  ExecutionRecord,
  ExecutionStatus,
  JobContext,
  JobDefinition,
  SchedulerError,
  SystemClock,
} from './SchedulerTypes';

export class JobExecutor {
  private _seq = 0;
  readonly records: ExecutionRecord[] = [];

  constructor(private readonly _clock: Clock = new SystemClock()) {}

  /**
   * Execute a job once for `scheduledAt`. Applies retry policy internally —
   * resolves when the job succeeds, all attempts fail, or it times out.
   * Returns the final execution record (attempt N).
   */
  async run(def: JobDefinition, scheduledAt: number): Promise<ExecutionRecord> {
    const retry = def.retry ?? { maxAttempts: 1, baseMs: 0, factor: 1, maxMs: 0 };
    let last: ExecutionRecord | null = null;
    for (let attempt = 1; attempt <= Math.max(1, retry.maxAttempts); attempt++) {
      last = await this._attempt(def, scheduledAt, attempt);
      if (last.status === 'success') return last;
      if (attempt < retry.maxAttempts) {
        const delay = Math.min(
          retry.baseMs * Math.pow(retry.factor, attempt - 1),
          retry.maxMs
        );
        await sleep(delay);
      }
    }
    return last!;
  }

  private async _attempt(
    def: JobDefinition,
    scheduledAt: number,
    attempt: number
  ): Promise<ExecutionRecord> {
    const rec: ExecutionRecord = {
      executionId: `exec-${++this._seq}`,
      jobId: def.jobId,
      scheduledAt,
      startedAt: this._clock.now(),
      finishedAt: null,
      status: 'running',
      attempt,
    };
    this.records.push(rec);
    const ctx: JobContext = {
      jobId: def.jobId,
      scheduledAt,
      dispatchedAt: rec.startedAt,
      attempt,
    };
    try {
      const result = await withTimeout(
        () => def.handler(ctx),
        def.timeoutMs ?? 0
      );
      rec.status = 'success';
      rec.result = result;
    } catch (e) {
      const isTimeout = e instanceof TimeoutError;
      rec.status = isTimeout ? 'timeout' : 'failure';
      rec.error = e instanceof Error ? e.message : String(e);
    }
    rec.finishedAt = this._clock.now();
    return rec;
  }
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`job timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Race `fn` against a timeout. `ms <= 0` disables the timeout.
 * The handler keeps running after a timeout wins — we can't cancel an
 * arbitrary promise — but its result is discarded.
 */
async function withTimeout(
  fn: () => Promise<unknown> | unknown,
  ms: number
): Promise<unknown> {
  if (ms <= 0) {
    return fn();
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
