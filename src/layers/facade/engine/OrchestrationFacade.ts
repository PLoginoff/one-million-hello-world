/**
 * OrchestrationFacade — sequential step pipeline with early exit and
 * compensation.
 *
 * Multi-step business flows ("validate → reserve → charge → notify")
 * need:
 *   - steps run strictly in order, each seeing a shared context;
 *   - a step can exit the pipeline early with a result (`EarlyExit`)
 *     without running the rest;
 *   - when a step fails, *already-completed* steps are compensated in
 *     reverse order (saga-style rollback) so partial work is undone;
 *   - per-step timing + an audit trail for "where did it stop and why".
 *
 * Context threading: `run` takes a `ctx` object mutated by each step —
 * steps communicate via the context, not via return values (return
 * values become the step's recorded output only). `EarlyExit` return
 * unwraps into the final result immediately.
 *
 * Compensation: a step may declare `compensate(ctx, output)`; on a
 * later failure the orchestrator runs compensations of completed steps
 * newest→oldest. Compensation errors are swallowed (logged into the
 * audit) — a failed rollback shouldn't mask the original error.
 *
 * Complexity: O(#steps); compensation O(#completed).
 *
 * @module FacadeLayer/Engine
 */

import { EarlyExit, FacadeEngineClock, StepFailedError, SystemEngineClock } from './types';

export interface Step<C, R = unknown> {
  readonly name: string;
  /**
   * Run the step. Return a value to continue (recorded in the audit),
   * or `new EarlyExit(v)` to stop the pipeline with `v` as the result.
   */
  run(ctx: C): Promise<R | EarlyExit<R>> | R | EarlyExit<R>;
  /**
   * Undo this step's effects. Called with the step's own output during
   * rollback. Errors are caught and logged, never thrown.
   */
  compensate?(ctx: C, output: R): Promise<void> | void;
}

export interface StepAuditEntry {
  step: string;
  index: number;
  startedAt: number;
  durationMs: number;
  outcome: 'completed' | 'early-exit' | 'failed' | 'skipped' | 'compensated' | 'compensation-failed';
  error?: string;
}

export interface OrchestrationResult<R> {
  ok: boolean;
  /** Set on success or early-exit. */
  value?: R;
  /** Step where the pipeline stopped (index into `steps`). */
  stoppedAt: number;
  /** `early-exit` | `failed` | `completed` */
  exitKind: 'completed' | 'early-exit' | 'failed';
  error?: StepFailedError;
  /** Which steps were compensated on failure (names, newest first). */
  compensated: string[];
  audit: StepAuditEntry[];
  durationMs: number;
}

export interface OrchestrationOptions {
  clock?: FacadeEngineClock;
}

export class OrchestrationFacade {
  private readonly _clock: FacadeEngineClock;

  constructor(options: OrchestrationOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
  }

  /**
   * Run `steps` against `ctx` in order. Returns the pipeline result —
   * never throws; failures are reported via `result.error`.
   */
  async run<C, R = unknown>(steps: readonly Step<C, R>[], ctx: C): Promise<OrchestrationResult<R>> {
    const startedAt = this._clock.now();
    const audit: StepAuditEntry[] = [];
    const completed: Array<{ step: Step<C, R>; index: number; output: R }> = [];
    let value: R | undefined;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const t0 = this._clock.now();
      try {
        const out = await step.run(ctx);
        if (out instanceof EarlyExit) {
          value = out.value as R;
          audit.push({ step: step.name, index: i, startedAt: t0, durationMs: this._clock.now() - t0, outcome: 'early-exit' });
          return this._finish(true, value, i, 'early-exit', undefined, [], audit, startedAt);
        }
        const output = out as R;
        completed.push({ step, index: i, output });
        audit.push({ step: step.name, index: i, startedAt: t0, durationMs: this._clock.now() - t0, outcome: 'completed' });
        value = output;
      } catch (err: unknown) {
        audit.push({
          step: step.name,
          index: i,
          startedAt: t0,
          durationMs: this._clock.now() - t0,
          outcome: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        // Compensate completed steps newest→oldest.
        const compensated: string[] = [];
        for (let j = completed.length - 1; j >= 0; j--) {
          const c = completed[j];
          if (!c.step.compensate) continue;
          try {
            await c.step.compensate(ctx, c.output);
            compensated.push(c.step.name);
            audit.push({
              step: c.step.name,
              index: c.index,
              startedAt: this._clock.now(),
              durationMs: 0,
              outcome: 'compensated',
            });
          } catch (cerr: unknown) {
            audit.push({
              step: c.step.name,
              index: c.index,
              startedAt: this._clock.now(),
              durationMs: 0,
              outcome: 'compensation-failed',
              error: cerr instanceof Error ? cerr.message : String(cerr),
            });
          }
        }
        const err2 = new StepFailedError(step.name, i, err);
        return this._finish<R>(false, undefined, i, 'failed', err2, compensated, audit, startedAt);
      }
    }

    return this._finish<R>(true, value, steps.length - 1, 'completed', undefined, [], audit, startedAt);
  }

  private _finish<R>(
    ok: boolean,
    value: R | undefined,
    stoppedAt: number,
    exitKind: OrchestrationResult<R>['exitKind'],
    error: StepFailedError | undefined,
    compensated: string[],
    audit: StepAuditEntry[],
    startedAt: number,
  ): OrchestrationResult<R> {
    return {
      ok,
      value,
      stoppedAt,
      exitKind,
      error,
      compensated,
      audit,
      durationMs: this._clock.now() - startedAt,
    };
  }
}
