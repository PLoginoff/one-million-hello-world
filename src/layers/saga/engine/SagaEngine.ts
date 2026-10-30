/**
 * SagaEngine — explicit-state-machine saga orchestrator.
 *
 * One `SagaEngine` hosts many concurrent saga *instances*, each isolated
 * by id and each driven through a fixed lifecycle:
 *
 *   started ──► running ──► completed            (happy path)
 *        │         │
 *        │         └──► compensating ──► compensated   (a step failed,
 *        │                │              completed steps undone in reverse)
 *        │                └──► failed                  (compensation itself failed)
 *        └──► failed                                   (couldn't even start)
 *
 * Step semantics:
 *   - actions run in order; each output lands in `ctx.outputs[name]`
 *     visible to later steps and compensations.
 *   - a step's `timeoutMs` is enforced via the injected `SagaScheduler`:
 *     the action races a clock tick; on timeout the step fails (then
 *     retries or triggers compensation).
 *   - `retries`/`retryBackoffBaseMs`/`retryBackoffFactor` retry a failed
 *     step BEFORE compensation starts — transient faults shouldn't undo
 *     committed work.
 *   - compensation runs strictly in reverse completion order; each entry
 *     receives its step's recorded output.
 *
 * Concurrency: instances are independent — `start` returns a handle;
 * `run`/`status`/`log` are per-instance. The engine never shares mutable
 * step state between instances.
 *
 * @module SagaLayer/Engine
 */

import { ManualScheduler, SystemScheduler } from './ManualScheduler';
import { SagaLog } from './SagaLog';
import {
  IllegalTransitionError,
  LEGAL_TRANSITIONS,
  SagaClock,
  SagaLifecycle,
  SagaScheduler,
  SagaStepDef,
  StepContext,
  StepTimeoutError,
  UnknownSagaError,
} from './types';

export interface SagaDefinition<C = unknown> {
  readonly name: string;
  readonly steps: readonly SagaStepDef<C>[];
}

export interface SagaEngineOptions {
  readonly clock?: SagaClock;
  readonly scheduler?: SagaScheduler;
}

interface SagaInstance<C> {
  readonly id: string;
  readonly def: SagaDefinition<C>;
  readonly input: C;
  state: SagaLifecycle;
  outputs: Record<string, unknown>;
  /** Names of steps that completed (compensation runs over this list). */
  completedSteps: string[];
}

export class SagaEngine {
  private readonly clock: SagaClock;
  private readonly scheduler: SagaScheduler;
  readonly log = new SagaLog();
  private readonly instances = new Map<string, SagaInstance<unknown>>();
  private idSeq = 0;

  constructor(options: SagaEngineOptions = {}) {
    this.clock = options.clock ?? new SystemScheduler();
    this.scheduler = options.scheduler ?? (this.clock as unknown as SagaScheduler);
  }

  /** Registers and starts a saga instance. Returns its id. */
  start<C>(def: SagaDefinition<C>, input: C): string {
    const id = `saga-${this.idSeq++}`;
    const instance: SagaInstance<C> = {
      id,
      def,
      input,
      state: 'started',
      outputs: {},
      completedSteps: [],
    };
    this.instances.set(id, instance as SagaInstance<unknown>);
    this.transition(instance as SagaInstance<unknown>, 'started' as SagaLifecycle, undefined);
    return id;
  }

  /** Lifecycle status of an instance (or via the log when asked). */
  status(id: string): SagaLifecycle {
    return this.must(id).state;
  }

  /** Outputs recorded so far (completed steps only). */
  outputs(id: string): Readonly<Record<string, unknown>> {
    return this.must(id).outputs;
  }

  /**
   * Runs an instance to a terminal state. Async steps race their timeouts
   * on the injected scheduler — with `ManualScheduler` the caller advances
   * time between `await`s to simulate the world.
   */
  async run(id: string): Promise<SagaLifecycle> {
    const inst = this.must(id) as SagaInstance<unknown>;
    if (inst.state === 'started') this.transition(inst, 'running');

    for (const step of inst.def.steps) {
      if (inst.state !== 'running') break;
      const ok = await this.runStep(inst, step);
      if (!ok) {
        // Step ultimately failed after retries — compensate.
        if (inst.state === 'running') this.transition(inst, 'compensating');
        await this.compensate(inst);
        break;
      }
    }

    if (inst.state === 'running') this.transition(inst, 'completed');
    return inst.state;
  }

  // ------------------------------------------------------------------------
  // Step execution
  // ------------------------------------------------------------------------

  private async runStep(inst: SagaInstance<unknown>, step: SagaStepDef<unknown>): Promise<boolean> {
    const maxAttempts = 1 + (step.retries ?? 0);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      this.log.append(inst.id, this.clock.now(), 'step_started', {
        step: step.name,
        detail: `attempt ${attempt + 1}/${maxAttempts}`,
      });
      const ctx: StepContext<unknown> = {
        sagaId: inst.id,
        input: inst.input,
        outputs: inst.outputs,
        step: step.name,
        attempt,
      };

      try {
        const output = await this.withTimeout(
          () => step.action(ctx),
          step.timeoutMs ?? 0,
          step.name,
          inst.id
        );
        inst.outputs[step.name] = output;
        inst.completedSteps.push(step.name);
        this.log.append(inst.id, this.clock.now(), 'step_succeeded', { step: step.name });
        return true;
      } catch (e) {
        const isTimeout = e instanceof StepTimeoutError;
        this.log.append(inst.id, this.clock.now(), isTimeout ? 'step_timed_out' : 'step_failed', {
          step: step.name,
          detail: e instanceof Error ? e.message : String(e),
        });
        if (attempt + 1 < maxAttempts) {
          const backoff =
            (step.retryBackoffBaseMs ?? 0) * Math.pow(step.retryBackoffFactor ?? 1, attempt);
          if (backoff > 0) await this.wait(backoff);
          this.log.append(inst.id, this.clock.now(), 'step_retrying', { step: step.name });
        }
      }
    }
    return false;
  }

  /**
   * Races `fn` against `timeoutMs` on the injected scheduler. The losing
   * path cancels the winner's timer. ManualScheduler makes this fully
   * deterministic in tests.
   */
  private withTimeout<T>(
    fn: () => Promise<T> | T,
    timeoutMs: number,
    stepName: string,
    sagaId: string
  ): Promise<T> {
    if (timeoutMs <= 0) return Promise.resolve().then(() => fn());
    return new Promise<T>((resolve, reject) => {
      const cancel = this.scheduler.setTimeout(() => {
        this.log.append(sagaId, this.clock.now(), 'step_timed_out', { step: stepName });
        reject(new StepTimeoutError(stepName, timeoutMs));
      }, timeoutMs);
      Promise.resolve()
        .then(() => fn())
        .then((v) => {
          cancel();
          resolve(v);
        })
        .catch((e) => {
          cancel();
          reject(e);
        });
    });
  }

  /** A scheduler-driven sleep (no real timers under ManualScheduler). */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scheduler.setTimeout(resolve, ms);
    });
  }

  // ------------------------------------------------------------------------
  // Compensation
  // ------------------------------------------------------------------------

  private async compensate(inst: SagaInstance<unknown>): Promise<void> {
    const steps = inst.def.steps;
    // Reverse completion order — undo latest work first.
    for (let i = inst.completedSteps.length - 1; i >= 0; i--) {
      const name = inst.completedSteps[i];
      const step = steps.find((s) => s.name === name);
      if (!step?.compensate) continue;
      const ctx: StepContext<unknown> = {
        sagaId: inst.id,
        input: inst.input,
        outputs: inst.outputs,
        step: name,
        attempt: 0,
      };
      try {
        await step.compensate(ctx, inst.outputs[name]);
        this.log.append(inst.id, this.clock.now(), 'compensated_step', { step: name });
      } catch (e) {
        this.log.append(inst.id, this.clock.now(), 'compensation_failed', {
          step: name,
          detail: e instanceof Error ? e.message : String(e),
        });
        this.transition(inst, 'failed');
        return;
      }
    }
    this.transition(inst, 'compensated');
  }

  // ------------------------------------------------------------------------

  private transition(inst: SagaInstance<unknown>, to: SagaLifecycle, detail?: string): void {
    const legal = LEGAL_TRANSITIONS[inst.state];
    // Initial 'started' is a no-op entry (already the state).
    if (to === inst.state) {
      this.log.append(inst.id, this.clock.now(), 'state', { state: to, detail });
      return;
    }
    if (!legal.includes(to)) {
      throw new IllegalTransitionError(inst.state, to);
    }
    inst.state = to;
    this.log.append(inst.id, this.clock.now(), 'state', { state: to, detail });
  }

  private must(id: string): SagaInstance<unknown> {
    const inst = this.instances.get(id);
    if (!inst) throw new UnknownSagaError(id);
    return inst;
  }
}

// ManualScheduler re-exported for convenience in tests.
export { ManualScheduler, SystemScheduler };
