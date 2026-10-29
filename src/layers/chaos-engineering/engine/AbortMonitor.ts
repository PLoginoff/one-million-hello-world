/**
 * Chaos Engineering — Abort Condition Monitor
 *
 * Continuously evaluates {@link AbortCondition}s against a rolling metric
 * window. Each condition keeps a ring buffer of (timestamp, value) samples;
 * a condition fires when the fraction of breaching samples inside its window
 * reaches `breachRatio` (default 1.0 — every in-window sample must breach).
 *
 * Implementation notes
 * --------------------
 * - Per-condition window storage is an array used as a ring buffer, pruned
 *   lazily on each `record` call: amortized O(1) per sample, O(W) memory where
 *   W is samples-per-window.
 * - `evaluate` is O(conditions × W) — called after each record batch or on a
 *   poll tick by the experiment engine.
 * - The monitor latches: once a condition trips it stays tripped until
 *   `reset()`, so a transient breach can't be "un-seen" by later evaluations.
 *
 * @module ChaosEngineering/Engine
 */

import { AbortCondition, ChaosClock } from './ChaosEngineTypes';

interface MetricSample {
  readonly at: number;
  readonly value: number;
}

interface ConditionState {
  readonly condition: AbortCondition;
  /** Ring buffer of recent samples for `condition.metric`, oldest first. */
  samples: MetricSample[];
  tripped: boolean;
  trippedAt?: number;
  lastObserved?: number;
  /** Breach ratio observed when the condition tripped. */
  trippedRatio?: number;
}

export interface AbortEvaluation {
  readonly shouldAbort: boolean;
  readonly triggeredBy?: AbortCondition;
  readonly observedValue?: number;
  readonly breachRatio?: number;
}

export class AbortMonitor {
  private readonly _states: Map<string, ConditionState> = new Map();
  private readonly _clock: ChaosClock;

  constructor(conditions: ReadonlyArray<AbortCondition>, clock: ChaosClock = Date.now) {
    this._clock = clock;
    for (const c of conditions) {
      this.addCondition(c);
    }
  }

  addCondition(condition: AbortCondition): void {
    if (this._states.has(condition.name)) {
      throw new Error(`abort condition '${condition.name}' already registered`);
    }
    if (condition.windowMs <= 0) {
      throw new RangeError(`abort condition '${condition.name}': windowMs must be positive`);
    }
    this._states.set(condition.name, {
      condition,
      samples: [],
      tripped: false,
    });
  }

  removeCondition(name: string): boolean {
    return this._states.delete(name);
  }

  get conditionNames(): ReadonlyArray<string> {
    return [...this._states.keys()];
  }

  /** Record a metric sample. Conditions watching other metrics ignore it. */
  record(metric: string, value: number): void {
    const now = this._clock();
    for (const state of this._states.values()) {
      if (state.condition.metric !== metric) continue;
      state.samples.push({ at: now, value });
      this._prune(state, now);
    }
  }

  /**
   * Evaluate all conditions against current samples. Returns the first
   * triggered condition (evaluation order = registration order).
   */
  evaluate(): AbortEvaluation {
    const now = this._clock();
    for (const state of this._states.values()) {
      if (state.tripped) {
        return {
          shouldAbort: true,
          triggeredBy: state.condition,
          observedValue: state.lastObserved,
          breachRatio: state.trippedRatio,
        };
      }
      this._prune(state, now);
      const c = state.condition;
      if (state.samples.length === 0) continue;

      let breaches = 0;
      let last: number | undefined;
      for (const s of state.samples) {
        last = s.value;
        if (this._breached(s.value, c)) breaches++;
      }
      const ratio = breaches / state.samples.length;
      const required = c.breachRatio ?? 1;
      if (ratio >= required) {
        state.tripped = true;
        state.trippedAt = now;
        state.lastObserved = last;
        state.trippedRatio = ratio;
        return {
          shouldAbort: true,
          triggeredBy: c,
          observedValue: last,
          breachRatio: ratio,
        };
      }
    }
    return { shouldAbort: false };
  }

  /** Record a sample then evaluate — the common call path. */
  recordAndEvaluate(metric: string, value: number): AbortEvaluation {
    this.record(metric, value);
    return this.evaluate();
  }

  /** Names of conditions currently in the tripped state. */
  trippedConditions(): ReadonlyArray<string> {
    const out: string[] = [];
    for (const state of this._states.values()) {
      if (state.tripped) out.push(state.condition.name);
    }
    return out;
  }

  /** Clear all samples and unlatch tripped conditions. */
  reset(): void {
    for (const state of this._states.values()) {
      state.samples.length = 0;
      state.tripped = false;
      state.trippedAt = undefined;
      state.lastObserved = undefined;
      state.trippedRatio = undefined;
    }
  }

  // ------------------------------------------------------------------ private

  private _breached(value: number, c: AbortCondition): boolean {
    switch (c.comparator) {
      case '>':
        return value > c.threshold;
      case '>=':
        return value >= c.threshold;
      case '<':
        return value < c.threshold;
      case '<=':
        return value <= c.threshold;
    }
  }

  /** Drop samples older than the condition's window. Amortized O(1). */
  private _prune(state: ConditionState, now: number): void {
    const cutoff = now - state.condition.windowMs;
    let i = 0;
    while (i < state.samples.length && state.samples[i].at < cutoff) i++;
    if (i > 0) state.samples.splice(0, i);
  }
}
