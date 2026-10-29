/**
 * Chaos Engineering — Experiment Engine
 *
 * Orchestrates a {@link ChaosExperimentDefinition} through its lifecycle state
 * machine:
 *
 *   DEFINED → VALIDATING → BASELINE → RUNNING → ANALYZING → COMPLETED
 *                                   ↘          ↘ ABORTED / FAILED (from any)
 *
 * Responsibilities
 * ----------------
 * - Guarded state transitions (illegal transitions throw `InvalidTransitionError`).
 * - Baseline capture via {@link SteadyStateChecker} (before-phase sampling).
 * - Fault lifecycle: arm all faults at RUNNING entry, disarm on every exit path
 *   (complete, abort, or fail) — faults can never outlive the experiment.
 * - Abort wiring: `feedMetric()` pushes observations into the {@link AbortMonitor};
 *   a tripped condition triggers a synchronous transition to ABORTED.
 * - During-phase sampling on `tick()` so callers control the clock in tests.
 * - Final analysis produces {@link ProbeVerdict}s and the hypothesis verdict.
 *
 * Timing model: the engine never self-schedules; the caller advances time by
 * calling `tick()` (or `run()` which drives ticks off an injectable async
 * sleeper). This keeps the engine deterministic under a fake {@link ChaosClock}.
 *
 * @module ChaosEngineering/Engine
 */

import {
  AbortCondition,
  ChaosClock,
  ChaosExperimentDefinition,
  ChaosRandomSource,
  ExperimentReport,
  ExperimentState,
  ExperimentTransition,
  EXPERIMENT_TRANSITIONS,
  ProbeVerdict,
  TERMINAL_EXPERIMENT_STATES,
} from './ChaosEngineTypes';
import { AbortMonitor } from './AbortMonitor';
import { FaultInjector } from './FaultInjector';
import { SamplePhase, SteadyStateChecker } from './SteadyStateChecker';

export class InvalidTransitionError extends Error {
  constructor(from: ExperimentState, to: ExperimentState) {
    super(`invalid experiment transition ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ExperimentValidationError extends Error {
  readonly problems: ReadonlyArray<string>;
  constructor(problems: ReadonlyArray<string>) {
    super(`experiment validation failed: ${problems.join('; ')}`);
    this.name = 'ExperimentValidationError';
    this.problems = problems;
  }
}

export class ChaosExperimentEngine {
  private readonly _definition: ChaosExperimentDefinition;
  private readonly _clock: ChaosClock;
  private readonly _random: ChaosRandomSource;
  private readonly _injector: FaultInjector;
  private readonly _checker: SteadyStateChecker;
  private readonly _monitor: AbortMonitor;

  private _state: ExperimentState = ExperimentState.DEFINED;
  private readonly _transitions: ExperimentTransition[] = [];
  private _abortTriggeredBy: string | undefined;
  private _startedAt = 0;
  private _runStartedAt = 0;

  constructor(
    definition: ChaosExperimentDefinition,
    clock: ChaosClock = Date.now,
    random: ChaosRandomSource = Math.random
  ) {
    this._definition = definition;
    this._clock = clock;
    this._random = random;
    this._injector = new FaultInjector(definition.scope, clock, random);
    this._checker = new SteadyStateChecker(clock);
    this._monitor = new AbortMonitor(definition.abortConditions, clock);
    for (const probe of definition.hypothesis) {
      this._checker.registerProbe(probe);
    }
  }

  get state(): ExperimentState {
    return this._state;
  }

  get definition(): ChaosExperimentDefinition {
    return this._definition;
  }

  get injector(): FaultInjector {
    return this._injector;
  }

  get checker(): SteadyStateChecker {
    return this._checker;
  }

  get transitions(): ReadonlyArray<ExperimentTransition> {
    return this._transitions;
  }

  get abortTriggeredBy(): string | undefined {
    return this._abortTriggeredBy;
  }

  /** Whether the current state is terminal. */
  get isTerminal(): boolean {
    return TERMINAL_EXPERIMENT_STATES.has(this._state);
  }

  /**
   * Guarded transition. Records the transition with timestamp + reason and
   * performs exit/entry side-effects (arm/disarm faults). Throws on illegal
   * transitions — the state machine is fail-closed.
   */
  transition(to: ExperimentState, reason = ''): void {
    const allowed = EXPERIMENT_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidTransitionError(this._state, to);
    }
    const from = this._state;
    this._transitions.push({ from, to, at: this._clock(), reason });
    this._state = to;

    // Leaving RUNNING for any reason ⇒ disarm everything, always.
    if (from === ExperimentState.RUNNING && to !== ExperimentState.RUNNING) {
      this._injector.disarmAll();
    }
    if (to === ExperimentState.RUNNING) {
      for (const fault of this._definition.faults) {
        this._injector.arm(fault);
      }
      this._runStartedAt = this._clock();
    }
  }

  /**
   * Validate the definition and move to BASELINE, sampling all probes once
   * for the pre-experiment steady state. Throws ExperimentValidationError.
   */
  async start(): Promise<void> {
    this.transition(ExperimentState.VALIDATING, 'start requested');
    const problems = this._validateDefinition();
    if (problems.length > 0) {
      this.transition(ExperimentState.FAILED, 'validation failed');
      throw new ExperimentValidationError(problems);
    }
    this._startedAt = this._clock();
    this.transition(ExperimentState.BASELINE, 'definition validated');
    if ((this._definition.warmupMs ?? 0) > 0) {
      // The caller is expected to tick() through the warmup; we still take one
      // baseline sample now so verdicts have data even in degenerate runs.
    }
    await this._checker.sampleAll(SamplePhase.BASELINE);
  }

  /** Move BASELINE → RUNNING, arming faults. */
  beginInjection(): void {
    this.transition(ExperimentState.RUNNING, 'baseline captured, injection begins');
  }

  /**
   * Drive one step of the running experiment: check the abort monitor, take
   * during-phase samples, and auto-transition to ANALYZING once `durationMs`
   * of RUN time has elapsed on the engine clock. No-op outside RUNNING.
   */
  async tick(): Promise<void> {
    if (this._state !== ExperimentState.RUNNING) return;

    const evalResult = this._monitor.evaluate();
    if (evalResult.shouldAbort) {
      this.abort(evalResult.triggeredBy?.name ?? 'abort monitor');
      return;
    }

    await this._checker.sampleAll(SamplePhase.DURING);

    if (this._clock() - this._runStartedAt >= this._definition.durationMs) {
      this.transition(ExperimentState.ANALYZING, 'duration elapsed');
    }
  }

  /** Feed an operational metric into the abort monitor (call from RUNNING). */
  feedMetric(metric: string, value: number): void {
    this._monitor.record(metric, value);
  }

  /** Feed + evaluate; aborts the experiment immediately if a condition trips. */
  feedMetricAndCheck(metric: string, value: number): boolean {
    this._monitor.record(metric, value);
    const r = this._monitor.evaluate();
    if (r.shouldAbort && this._state === ExperimentState.RUNNING) {
      this.abort(r.triggeredBy?.name ?? 'abort monitor');
      return true;
    }
    return false;
  }

  /** Emergency stop from any non-terminal state that permits it. */
  abort(reason: string): void {
    if (this.isTerminal) return;
    this._abortTriggeredBy = reason;
    this.transition(ExperimentState.ABORTED, reason);
  }

  /** Run the analysis phase: post samples + verdicts → COMPLETED or FAILED. */
  async analyze(): Promise<{ held: boolean; verdicts: ReadonlyArray<ProbeVerdict> }> {
    if (this._state !== ExperimentState.ANALYZING) {
      throw new Error(`analyze() requires ANALYZING state, currently ${this._state}`);
    }
    await this._checker.sampleAll(SamplePhase.AFTER);
    const { held, verdicts } = this._checker.evaluateAll();
    this.transition(held ? ExperimentState.COMPLETED : ExperimentState.FAILED,
      held ? 'hypothesis held' : 'hypothesis violated');
    return { held, verdicts };
  }

  /**
   * Full lifecycle driver: start → inject → tick until duration elapses or an
   * abort fires → analyze. `sleeper` is injectable so tests can advance a fake
   * clock without real delays. Returns the final report.
   */
  async run(sleeper: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<ExperimentReport> {
    await this.start();
    this.beginInjection();
    const stepMs = Math.max(1, Math.floor(this._definition.durationMs / 10));
    while (this._state === ExperimentState.RUNNING) {
      await sleeper(stepMs);
      await this.tick();
    }
    if (this._state === ExperimentState.ANALYZING) {
      await this.analyze();
    }
    return this.report();
  }

  /** Build the immutable run report. */
  report(): ExperimentReport {
    const { verdicts } = this.isTerminal
      ? this._checker.evaluateAll()
      : { verdicts: [] as ReadonlyArray<ProbeVerdict> };
    const finishedAt = this._clock();
    const hypothesisHeld =
      this._state === ExperimentState.COMPLETED && verdicts.every((v) => v.passed);
    return {
      experimentId: this._definition.id,
      finalState: this._state,
      transitions: this._transitions,
      decisions: this._injector.decisionLog,
      verdicts,
      abortTriggeredBy: this._abortTriggeredBy,
      hypothesisHeld,
      startedAt: this._startedAt,
      finishedAt,
      durationMs: finishedAt - this._startedAt,
    };
  }

  // ------------------------------------------------------------------ private

  private _validateDefinition(): string[] {
    const d = this._definition;
    const problems: string[] = [];
    if (!d.id) problems.push('id is required');
    if (!d.name) problems.push('name is required');
    if (d.faults.length === 0) problems.push('at least one fault is required');
    if (d.durationMs <= 0) problems.push('durationMs must be positive');
    if (!(d.scope.percentage > 0 && d.scope.percentage <= 1)) {
      problems.push('scope.percentage must be in (0,1]');
    }
    const ids = new Set<string>();
    for (const f of d.faults) {
      if (ids.has(f.id)) problems.push(`duplicate fault id '${f.id}'`);
      ids.add(f.id);
      if (!(f.probability >= 0 && f.probability <= 1)) {
        problems.push(`fault '${f.id}' probability out of [0,1]`);
      }
    }
    for (const p of d.hypothesis) {
      if (p.minSamples < 1) problems.push(`probe '${p.name}' minSamples must be ≥ 1`);
    }
    const minConf = d.minConfidence;
    if (minConf !== undefined && !(minConf >= 0 && minConf <= 1)) {
      problems.push('minConfidence must be in [0,1]');
    }
    return problems;
  }
}
