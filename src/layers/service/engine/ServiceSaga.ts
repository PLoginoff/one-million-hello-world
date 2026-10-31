/**
 * Service Saga — compensating-action orchestration per service operation.
 *
 * Unlike the saga layer's explicit state machine, this module wraps the
 * *service pipeline*: each registered step is a service operation +
 * compensation pair. Steps run sequentially; when step N throws, the
 * engine walks the completed stack backwards invoking compensations.
 *
 * Key differences from the generic `SagaEngine`:
 *   - Typed step outputs flow forward (`ctx.put`/`ctx.get`), so a
 *     compensation receives the value its forward step produced.
 *   - Compensation failures don't abort the rollback — they're logged
 *     in the report and the walk continues (the original failure is the
 *     one that matters).
 *   - A step can declare `compensable: false` for read-only ops —
 *     they still participate in ordering but contribute nothing to the
 *     compensation stack.
 *
 * Compensation runs strictly LIFO — undo order mirrors commit order so
 * a step that depended on an earlier step's output is unwound after
 * its dependents.
 *
 * @module ServiceLayer/Engine
 */

import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Step definition — forward action + optional compensation. */
export interface SagaStep<C> {
  /** Step name (reported in the saga report). */
  readonly name: string;
  /** Forward action. Receives the saga context. */
  readonly action: (ctx: SagaStepContext<C>) => Promise<unknown>;
  /**
   * Compensation — invoked with the *result* of `action` when a later
   * step fails. Undefined ⇒ `compensable` is implied false.
   */
  readonly compensate?: (ctx: SagaStepContext<C>, output: unknown) => Promise<void>;
  /** Explicit opt-out even when `compensate` is defined. */
  readonly compensable?: boolean;
}

/** Per-step context shared across a saga execution. */
export interface SagaStepContext<C> {
  /** Caller's input payload. */
  readonly input: C;
  /** Step outputs recorded so far — later steps read earlier results. */
  get(name: string): unknown;
  /** Record this step's output (auto-recorded; explicit puts allowed). */
  put(name: string, value: unknown): void;
  /** Free-form state bag. */
  readonly state: Record<string, unknown>;
}

/** Outcome of one saga execution. */
export interface SagaReport {
  /** Terminal status. */
  readonly status: 'completed' | 'compensated' | 'compensation_failed' | 'failed';
  /** Ordered step names that completed. */
  readonly completedSteps: readonly string[];
  /** Step names whose compensation ran (LIFO order). */
  readonly compensatedSteps: readonly string[];
  /** Step name that triggered rollback. */
  readonly failedStep?: string;
  /** The error thrown by the failing step. */
  readonly error?: unknown;
  /** Errors thrown *during* compensation (kept — they don't replace `error`). */
  readonly compensationErrors: readonly { step: string; error: unknown }[];
  /** Step outputs recorded during the run (empty on rollback). */
  readonly outputs: ReadonlyMap<string, unknown>;
  /** End-to-end duration in ms. */
  readonly durationMs: number;
}

/** Options for {@link ServiceSaga}. */
export interface ServiceSagaOptions {
  readonly clock?: Clock;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Internal mutable execution state — never shared across runs. */
interface ExecutionState<C> {
  readonly outputs: Map<string, unknown>;
  readonly completed: Array<{ step: SagaStep<C>; output: unknown }>;
  readonly state: Record<string, unknown>;
}

/**
 * Service saga runner.
 *
 * Registered once (`define`) and executed many times (`run`). Each
 * `run` gets a fresh `ExecutionState` — concurrent invocations can't
 * leak outputs into each other.
 */
export class ServiceSaga<C> {
  private readonly _steps: readonly SagaStep<C>[];
  private readonly _clock: Clock;

  constructor(steps: readonly SagaStep<C>[], options?: ServiceSagaOptions) {
    this._steps = steps;
    this._clock = options?.clock ?? new SystemClock();
  }

  /** Step count. */
  get stepCount(): number {
    return this._steps.length;
  }

  /**
   * Execute the saga over `input`.
   *
   * Forward pass: each step's output is stored under its name so later
   * steps can `ctx.get('earlier')`. On a throw the loop breaks and
   * compensation unwinds the completed stack in reverse.
   */
  async run(input: C): Promise<SagaReport> {
    const started = this._clock.now();
    const exec: ExecutionState<C> = { outputs: new Map(), completed: [], state: {} };
    const ctx = this.makeContext(input, exec);

    for (const step of this._steps) {
      try {
        const output = await step.action(ctx);
        exec.outputs.set(step.name, output);
        exec.completed.push({ step, output });
      } catch (error) {
        return this.rollback(input, exec, step, error, started);
      }
    }

    return {
      status: 'completed',
      completedSteps: exec.completed.map((c) => c.step.name),
      compensatedSteps: [],
      compensationErrors: [],
      outputs: new Map(exec.outputs),
      durationMs: this._clock.now() - started,
    };
  }

  /**
   * Unwind the completed stack LIFO. Compensation errors are collected
   * but do not stop the walk — a half-rolled-back system is strictly
   * worse than a fully-attempted one with logged gaps.
   */
  private async rollback(
    input: C,
    exec: ExecutionState<C>,
    failedStep: SagaStep<C>,
    error: unknown,
    started: number
  ): Promise<SagaReport> {
    const ctx = this.makeContext(input, exec);
    const compensated: string[] = [];
    const compErrors: { step: string; error: unknown }[] = [];

    for (let i = exec.completed.length - 1; i >= 0; i--) {
      const { step, output } = exec.completed[i];
      const canCompensate = step.compensable !== false && step.compensate !== undefined;
      if (!canCompensate) {
        continue;
      }
      try {
        await step.compensate(ctx, output);
        compensated.push(step.name);
      } catch (compErr) {
        compErrors.push({ step: step.name, error: compErr });
      }
    }

    const status = compErrors.length > 0 ? 'compensation_failed' : 'compensated';
    return {
      status,
      completedSteps: exec.completed.map((c) => c.step.name),
      compensatedSteps: compensated,
      failedStep: failedStep.name,
      error,
      compensationErrors: compErrors,
      outputs: new Map(exec.outputs),
      durationMs: this._clock.now() - started,
    };
  }

  private makeContext(input: C, exec: ExecutionState<C>): SagaStepContext<C> {
    return {
      input,
      get: (name) => exec.outputs.get(name),
      put: (name, value) => {
        exec.outputs.set(name, value);
      },
      state: exec.state,
    };
  }
}

/** Convenience builder — `defineSaga(input => [step, ...])`. */
export function defineSaga<C>(steps: readonly SagaStep<C>[], options?: ServiceSagaOptions): ServiceSaga<C> {
  return new ServiceSaga(steps, options);
}
