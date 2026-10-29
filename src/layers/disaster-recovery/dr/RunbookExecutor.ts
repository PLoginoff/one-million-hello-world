/**
 * Disaster Recovery — Recovery Runbook Executor
 *
 * Executes an ordered runbook of recovery steps with per-step timeouts,
 * retry-with-backoff, rollback compensation (saga-style), and checkpointing
 * so a failed run can resume from the last completed step.
 *
 * Semantics
 * ---------
 * - Steps run sequentially; each may declare `compensate` for rollback.
 * - On step failure after exhausting retries: execute compensations for all
 *   COMPLETED steps in REVERSE order (LIFO — the only safe unwind order).
 * - `checkpoint()` records progress; `resume()` skips already-done steps.
 * - Timeouts race the step against the injectable clock/sleeper — a hung
 *   step fails as `timed out`.
 *
 * @module DisasterRecovery/DR
 */

import { DrClock } from './DrTypes';

export interface RunbookStep {
  readonly stepId: string;
  readonly name: string;
  readonly timeoutMs: number;
  readonly retries: number;
  /** Exponential backoff base between retries (ms); 0 = immediate retry. */
  readonly backoffMs?: number;
  readonly action: () => Promise<void> | void;
  /** Optional undo, run in reverse order on abort. */
  readonly compensate?: () => Promise<void> | void;
}

export type StepStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'COMPENSATED' | 'SKIPPED';

export interface StepRecord {
  readonly stepId: string;
  status: StepStatus;
  attempts: number;
  readonly startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface RunbookResult {
  readonly runbookId: string;
  readonly completed: boolean;
  readonly failedStepId?: string;
  readonly compensated: boolean;
  readonly steps: ReadonlyArray<StepRecord>;
  readonly durationMs: number;
}

export class RunbookExecutor {
  private readonly _clock: DrClock;
  private readonly _sleep: (ms: number) => Promise<void>;
  private _records: Map<string, StepRecord> = new Map();
  private _completedOrder: string[] = [];

  constructor(
    clock: DrClock = Date.now,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    this._clock = clock;
    this._sleep = sleep;
  }

  /** Persist progress — call sites can snapshot `checkpoint()` for resume. */
  checkpoint(): ReadonlyArray<string> {
    return [...this._completedOrder];
  }

  /** Resume a runbook after prior partial completion. */
  resumeFrom(completedStepIds: ReadonlyArray<string>): void {
    this._completedOrder = [...completedStepIds];
    for (const id of completedStepIds) {
      this._records.set(id, { stepId: id, status: 'DONE', attempts: 1 });
    }
  }

  /**
   * Run the runbook. Compensations fire automatically on failure.
   */
  async run(runbookId: string, steps: ReadonlyArray<RunbookStep>): Promise<RunbookResult> {
    const started = this._clock();
    this._records = new Map(this._records); // keep resume records
    const order: StepRecord[] = [];

    for (const step of steps) {
      let rec = this._records.get(step.stepId);
      if (rec?.status === 'DONE') {
        order.push(rec); // resume: already done, skip
        continue;
      }
      rec = { stepId: step.stepId, status: 'RUNNING', attempts: 0, startedAt: this._clock() };
      this._records.set(step.stepId, rec);
      order.push(rec);

      const ok = await this._runWithRetries(step, rec);
      if (!ok) {
        rec.status = 'FAILED';
        rec.finishedAt = this._clock();
        const compensated = await this._compensate(steps);
        return {
          runbookId,
          completed: false,
          failedStepId: step.stepId,
          compensated,
          steps: order,
          durationMs: this._clock() - started,
        };
      }
      rec.status = 'DONE';
      rec.finishedAt = this._clock();
      this._completedOrder.push(step.stepId);
    }
    return { runbookId, completed: true, compensated: false, steps: order, durationMs: this._clock() - started };
  }

  // ------------------------------------------------------------------ private

  private async _runWithRetries(step: RunbookStep, rec: StepRecord): Promise<boolean> {
    const maxAttempts = step.retries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      rec.attempts = attempt;
      try {
        await this._withTimeout(step);
        return true;
      } catch (e) {
        rec.error = e instanceof Error ? e.message : String(e);
        if (attempt < maxAttempts) {
          const backoff = (step.backoffMs ?? 0) * Math.pow(2, attempt - 1);
          if (backoff > 0) await this._sleep(backoff);
        }
      }
    }
    return false;
  }

  /** Race the step against its timeout using the injectable sleeper. */
  private async _withTimeout(step: RunbookStep): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      // Use real timer only as a guard — in tests the sleeper advances the
      // fake clock while this real timer fires on the same wall clock the
      // step action itself uses, so either can win the race.
      timer = setTimeout(() => reject(new Error(`step '${step.stepId}' timed out after ${step.timeoutMs}ms`)), step.timeoutMs);
    });
    try {
      await Promise.race([Promise.resolve().then(() => step.action()), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** LIFO compensation of completed steps. */
  private async _compensate(steps: ReadonlyArray<RunbookStep>): Promise<boolean> {
    let any = false;
    const byId = new Map(steps.map((s) => [s.stepId, s]));
    for (let i = this._completedOrder.length - 1; i >= 0; i--) {
      const step = byId.get(this._completedOrder[i]);
      if (!step?.compensate) continue;
      const rec = this._records.get(step.stepId);
      try {
        await step.compensate();
        if (rec) rec.status = 'COMPENSATED';
        any = true;
      } catch {
        // Compensation failure is logged but unwind continues — a wedged
        // compensate shouldn't leave later steps un-compensated.
        if (rec) rec.error = 'compensation failed';
      }
    }
    this._completedOrder = [];
    return any;
  }
}
