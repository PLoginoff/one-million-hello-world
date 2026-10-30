/**
 * Alert Rule Evaluator — thresholds with `for`-duration semantics.
 *
 * Models the Prometheus alerting state machine per (rule × series):
 *
 *     ok ──breach──► pending ──held for forDurationMs──► firing
 *                   ▲    │                                   │
 *                   │    └─clears─┘                          │ condition
 *                   └──────────────────────────────────────┘ clears for
 *                                                              resolveAfterMs
 *
 * Key subtleties implemented here:
 *  - A breach timer starts on the *first breaching sample* and survives
 *    non-breaching gaps only if configured (`keepFiringFor`-style is NOT
 *    implemented — a clear while pending resets the timer, matching
 *    Prometheus).
 *  - Multiple attribute-variants of the same metric evaluate as
 *    independent series with independent state.
 *  - Evaluation is driven by `evaluate(sample|value)` calls — the
 *    caller feeds observations, the evaluator owns the clock.
 *
 * @module ObservabilityLayer/Engine2
 */

import { attributeKey } from '../engine/MetricsEngine';
import { Attributes } from '../engine/signals';
import {
  AlertInstance,
  AlertRule,
  AlertTransition,
  COMPARATORS,
  IClock,
  RuleState,
} from './types';
import { SystemClock } from '../engine/signals';

interface RuleRuntime {
  state: RuleState;
  breachStartedMs?: number;
  firedAtMs?: number;
  clearedAtMs?: number;
  lastValue?: number;
}

export interface Observation {
  readonly value: number;
  readonly attributes?: Attributes;
  readonly timestampMs?: number;
}

/**
 * Evaluates a set of `AlertRule`s against a stream of observations.
 * All timing is driven off the injected clock plus optional per-
 * observation timestamps (which take precedence — useful for replay).
 */
export class AlertEvaluator {
  private readonly _clock: IClock;
  private readonly _rules = new Map<string, AlertRule>();
  /** ruleId → (seriesKey → runtime). */
  private readonly _state = new Map<string, Map<string, RuleRuntime>>();
  private readonly _transitions: AlertTransition[] = [];

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  registerRule(rule: AlertRule): void {
    this._rules.set(rule.id, rule);
    if (!this._state.has(rule.id)) this._state.set(rule.id, new Map());
  }

  unregisterRule(ruleId: string): void {
    this._rules.delete(ruleId);
    this._state.delete(ruleId);
  }

  /**
   * Feed one observation of `metric`. Every registered rule on that
   * metric evaluates it; rules whose `matchAttributes` are not a subset
   * of the observation's attributes skip it.
   *
   * Returns the transitions this observation caused (usually []).
   */
  evaluate(metric: string, obs: Observation): AlertTransition[] {
    const now = obs.timestampMs ?? this._clock.nowMs();
    const out: AlertTransition[] = [];
    for (const rule of this._rules.values()) {
      if (rule.metric !== metric) continue;
      if (!attrsMatch(rule.matchAttributes, obs.attributes)) continue;
      const key = attributeKey(obs.attributes);
      const seriesMap = this._state.get(rule.id);
      if (!seriesMap) continue;
      let rt = seriesMap.get(key);
      if (!rt) {
        rt = { state: 'ok' };
        seriesMap.set(key, rt);
      }
      const breached = COMPARATORS[rule.comparator](obs.value, rule.threshold);
      rt.lastValue = obs.value;
      const prev = rt.state;

      if (breached) {
        rt.clearedAtMs = undefined;
        if (rt.state === 'ok') {
          rt.breachStartedMs = now;
          rt.state = rule.forDurationMs <= 0 ? 'firing' : 'pending';
          if (rt.state === 'firing') rt.firedAtMs = now;
        } else if (rt.state === 'pending') {
          if (now - (rt.breachStartedMs ?? now) >= rule.forDurationMs) {
            rt.state = 'firing';
            rt.firedAtMs = now;
          }
        }
        // firing stays firing while breaching.
      } else {
        if (rt.state === 'pending') {
          // A clear while pending resets the breach timer.
          rt.state = 'ok';
          rt.breachStartedMs = undefined;
        } else if (rt.state === 'firing') {
          const resolveAfter = rule.resolveAfterMs ?? 0;
          if (resolveAfter <= 0) {
            rt.state = 'ok';
            rt.breachStartedMs = undefined;
            rt.firedAtMs = undefined;
          } else {
            if (rt.clearedAtMs === undefined) rt.clearedAtMs = now;
            if (now - rt.clearedAtMs >= resolveAfter) {
              rt.state = 'ok';
              rt.breachStartedMs = undefined;
              rt.firedAtMs = undefined;
              rt.clearedAtMs = undefined;
            }
          }
        }
      }

      if (rt.state !== prev) {
        const t: AlertTransition = {
          ruleId: rule.id,
          seriesKey: key,
          from: prev,
          to: rt.state,
          value: obs.value,
          atMs: now,
        };
        this._transitions.push(t);
        out.push(t);
      }
    }
    return out;
  }

  /** Snapshot every (rule, series) instance for dashboards. */
  instances(): AlertInstance[] {
    const out: AlertInstance[] = [];
    for (const [ruleId, seriesMap] of this._state) {
      for (const [seriesKey, rt] of seriesMap) {
        out.push({
          ruleId,
          seriesKey,
          state: rt.state,
          breachStartedMs: rt.breachStartedMs,
          firedAtMs: rt.firedAtMs,
          clearedAtMs: rt.clearedAtMs,
          lastValue: rt.lastValue,
        });
      }
    }
    return out;
  }

  /** Currently-firing instances only. */
  firing(): AlertInstance[] {
    return this.instances().filter((i) => i.state === 'firing');
  }

  /** Full transition log (chronological). */
  transitions(): ReadonlyArray<AlertTransition> {
    return this._transitions;
  }
}

/** Subset match: every key in `want` must equal `have[key]`. */
function attrsMatch(want: Attributes | undefined, have: Attributes | undefined): boolean {
  if (!want) return true;
  if (!have) return false;
  for (const k of Object.keys(want)) {
    if (have[k] !== want[k]) return false;
  }
  return true;
}
