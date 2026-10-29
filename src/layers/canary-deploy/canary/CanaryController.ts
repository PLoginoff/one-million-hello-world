/**
 * Canary Deploy — Rollout Controller
 *
 * Drives a progressive rollout through its state machine:
 *
 *   PLANNED → BASELINING → STEPPING ⇄ ANALYZING → PROMOTED
 *                              ↘ ROLLING_BACK → ROLLED_BACK
 *                              ↘ PAUSED (manual) → STEPPING
 *
 * Flow
 * ----
 * 1. BASELINING: collect baseline metrics for `baselineWindowMs` before any
 *    canary traffic — relative/statistical gates need a pre-canary reference.
 * 2. For each step: set the canary weight, soak for `analysisMs` (caller
 *    advances via `tick()` or the injected sleeper in `run()`), then run the
 *    gate analysis over the step's metric window.
 * 3. Gates passing → advance. A gate may fail `allowedFailures` consecutive
 *    windows before the controller triggers rollback (blip tolerance).
 * 4. Final step passes → PROMOTED (canary becomes the new baseline).
 * 5. Allowed-failures exhausted → ROLLING_BACK → ROLLED_BACK, weight → 0.
 *
 * The controller never schedules itself: `tick()` performs the current
 * state's pending work and is driven by `run()` (injectable sleeper) or
 * manually in tests for full determinism.
 *
 * @module CanaryDeploy/Canary
 */

import {
  AnalysisResult,
  CanaryClock,
  GateVerdict,
  MetricGate,
  RolloutState,
  RolloutTransition,
  ROLLOUT_TRANSITIONS,
} from './CanaryTypes';
import { StepPlanner } from './StepPlanner';
import { CanaryAnalyzer } from './CanaryAnalyzer';

export class InvalidRolloutTransition extends Error {
  constructor(from: RolloutState, to: RolloutState) {
    super(`invalid rollout transition ${from} → ${to}`);
    this.name = 'InvalidRolloutTransition';
  }
}

export interface RolloutConfig {
  readonly rolloutId: string;
  readonly version: string;
  readonly planner: StepPlanner;
  readonly gates: ReadonlyArray<MetricGate>;
  /** How long to baseline before first canary step (ms). */
  readonly baselineWindowMs: number;
  /** Metric window used by gate evaluations (defaults to step analysisMs). */
  readonly analysisWindowMs?: number;
}

export class CanaryController {
  private readonly _config: RolloutConfig;
  private readonly _clock: CanaryClock;
  private readonly _analyzer: CanaryAnalyzer;
  private readonly _sleep: (ms: number) => Promise<void>;

  private _state: RolloutState = RolloutState.PLANNED;
  private _transitions: RolloutTransition[] = [];
  private _stepIndex = 0;
  private _stepStartedAt = 0;
  private _baselineStartedAt = 0;
  private _weight = 0;
  private _results: AnalysisResult[] = [];
  private _consecutiveFailures = 0;
  private _maxAllowedFailures = 0;

  constructor(
    config: RolloutConfig,
    clock: CanaryClock = Date.now,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    analyzer?: CanaryAnalyzer
  ) {
    this._config = config;
    this._clock = clock;
    this._sleep = sleep;
    this._analyzer = analyzer ?? new CanaryAnalyzer(clock);
    this._maxAllowedFailures = Math.max(
      0,
      ...config.gates.map((g) => g.allowedFailures ?? 0)
    );
  }

  get state(): RolloutState {
    return this._state;
  }

  get weight(): number {
    return this._weight;
  }

  get stepIndex(): number {
    return this._stepIndex;
  }

  get analyzer(): CanaryAnalyzer {
    return this._analyzer;
  }

  get transitions(): ReadonlyArray<RolloutTransition> {
    return this._transitions;
  }

  get results(): ReadonlyArray<AnalysisResult> {
    return this._results;
  }

  get currentWeightPercent(): number {
    return this._weight;
  }

  /** Guarded transition. */
  transition(to: RolloutState, reason = ''): void {
    const allowed = ROLLOUT_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidRolloutTransition(this._state, to);
    }
    this._transitions.push({ from: this._state, to, at: this._clock(), reason });
    this._state = to;
  }

  /** Record a metric observation for a cohort. */
  recordMetric(metric: string, cohort: 'baseline' | 'canary', value: number): void {
    this._analyzer.record(metric, cohort, value);
  }

  /** Begin the rollout: capture baseline then start stepping. */
  async start(): Promise<void> {
    this.transition(RolloutState.BASELINING, 'rollout started');
    this._baselineStartedAt = this._clock();
    await this._sleep(this._config.baselineWindowMs);
    this.transition(RolloutState.STEPPING, 'baseline captured');
    this._beginStep(0);
  }

  /**
   * Advance the rollout. In STEPPING, checks whether the current step's soak
   * has elapsed and, if so, runs analysis → advance or rollback. Returns the
   * analysis result when one was produced this tick.
   */
  async tick(): Promise<AnalysisResult | null> {
    if (this._state !== RolloutState.STEPPING) return null;
    const step = this._config.planner.stepAt(this._stepIndex);
    if (this._clock() - this._stepStartedAt < step.analysisMs) {
      return null; // still soaking
    }
    this.transition(RolloutState.ANALYZING, `step ${this._stepIndex} soak complete`);
    const windowMs = this._config.analysisWindowMs ?? step.analysisMs;
    const { passed, verdicts } = this._analyzer.evaluateAll(this._config.gates, windowMs);
    const result: AnalysisResult = {
      stepIndex: this._stepIndex,
      windowStart: this._stepStartedAt,
      windowEnd: this._clock(),
      verdicts,
      passed,
    };
    this._results.push(result);

    if (passed) {
      this._consecutiveFailures = 0;
      if (this._stepIndex === this._config.planner.stepCount - 1) {
        this.transition(RolloutState.PROMOTED, 'final step passed — canary promoted');
        return result;
      }
      this.transition(RolloutState.STEPPING, 'gates passed — advancing');
      this._beginStep(this._stepIndex + 1);
    } else {
      this._consecutiveFailures++;
      if (this._consecutiveFailures > this._maxAllowedFailures) {
        this.transition(RolloutState.ROLLING_BACK, `gates failed ${this._consecutiveFailures}×`);
        this._weight = 0;
        this.transition(RolloutState.ROLLED_BACK, 'traffic restored to baseline');
      } else {
        // Blip tolerance: re-soak the same step and analyze again.
        this.transition(RolloutState.STEPPING, `retry ${this._consecutiveFailures}/${this._maxAllowedFailures}`);
        this._beginStep(this._stepIndex);
      }
    }
    return result;
  }

  /**
   * Full rollout driver. Baselines, then ticks until a terminal state.
   * `onMetric` is called each tick so callers can stream observations in.
   */
  async run(
    onMetric?: (tick: { stepIndex: number; weight: number }) => Promise<void> | void
  ): Promise<RolloutState> {
    await this.start();
    const guard = 10_000; // pathological-loop guard
    let i = 0;
    while (this._state === RolloutState.STEPPING && i++ < guard) {
      if (onMetric) {
        await onMetric({ stepIndex: this._stepIndex, weight: this._weight });
      }
      const step = this._config.planner.stepAt(this._stepIndex);
      await this._sleep(step.analysisMs);
      await this.tick();
    }
    return this._state;
  }

  /** Pause an in-flight rollout (manual hold). */
  pause(reason = 'manual pause'): void {
    this.transition(RolloutState.PAUSED, reason);
  }

  /** Resume a paused rollout at the current step (re-soaks it). */
  resume(): void {
    if (this._state !== RolloutState.PAUSED) {
      throw new Error(`resume() requires PAUSED, currently ${this._state}`);
    }
    this.transition(RolloutState.STEPPING, 'resumed');
    this._beginStep(this._stepIndex);
  }

  /** Operator-triggered rollback from any non-terminal running state. */
  rollback(reason = 'operator'): void {
    if (
      this._state === RolloutState.PROMOTED ||
      this._state === RolloutState.ROLLED_BACK ||
      this._state === RolloutState.FAILED ||
      this._state === RolloutState.ROLLING_BACK
    ) {
      return;
    }
    this.transition(RolloutState.ROLLING_BACK, reason);
    this._weight = 0;
    this.transition(RolloutState.ROLLED_BACK, 'traffic restored to baseline');
  }

  /** Verdicts from the most recent analysis window. */
  latestVerdicts(): ReadonlyArray<GateVerdict> {
    return this._results.length === 0 ? [] : this._results[this._results.length - 1].verdicts;
  }

  // ------------------------------------------------------------------ private

  private _beginStep(index: number): void {
    this._stepIndex = index;
    this._weight = this._config.planner.stepAt(index).weightPercent;
    this._stepStartedAt = this._clock();
  }
}
