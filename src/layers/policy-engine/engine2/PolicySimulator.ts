/**
 * Policy Engine — What-If Simulation
 *
 * Answers "would this request be allowed?" without touching production
 * state. Three modes:
 *
 *  - `wouldAllow(request)` — single-request simulation against a policy
 *    tree (or a resolved bundle's effective set).
 *  - `scenarioSuite` — batch a named list of (request → expected effect)
 *    pairs; produces a regression-test-style report flagging mismatches.
 *    This is the CI gate for policy changes: define expected outcomes for
 *    key requests, run the suite against the candidate bundle, fail on
 *    drift.
 *  - `attributeSweep` — vary one attribute across a value range and report
 *    the decision boundary (e.g. "at what clearance level does this
 *    resource become readable?").
 *
 * Simulation reuses {@link DecisionExplainer} for correctness *and* gets
 * the trace for free — a mismatched scenario explains itself.
 *
 * @module PolicyEngine/Engine2
 */

import {
  DecisionEffect,
  Policy,
  PolicyRequest,
  PolicySet,
} from '../domain/policy-model';
import { DecisionExplainer, DecisionExplanation } from './DecisionExplainer';

export interface SimulationResult {
  readonly request: PolicyRequest;
  readonly effect: DecisionEffect;
  readonly explanation: DecisionExplanation;
}

export interface Scenario {
  readonly name: string;
  readonly request: PolicyRequest;
  readonly expect: DecisionEffect;
}

export interface ScenarioOutcome {
  readonly scenario: Scenario;
  readonly actual: DecisionEffect;
  readonly passed: boolean;
  /** Trace narrative — populated only when the outcome mismatches. */
  readonly narrative?: ReadonlyArray<string>;
}

export interface ScenarioReport {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly outcomes: ReadonlyArray<ScenarioOutcome>;
}

export interface SweepPoint {
  readonly value: unknown;
  readonly effect: DecisionEffect;
}

export interface SweepReport {
  readonly category: 'subject' | 'resource' | 'action' | 'environment';
  readonly path: string;
  readonly points: ReadonlyArray<SweepPoint>;
  /** Distinct effects observed, in order of first appearance. */
  readonly effects: ReadonlyArray<DecisionEffect>;
  /** Indexes into `points` where the effect changes. */
  readonly boundaries: ReadonlyArray<number>;
}

export class PolicySimulator {
  private readonly _root: Policy | PolicySet;
  private readonly _explainer = new DecisionExplainer();

  constructor(root: Policy | PolicySet) {
    this._root = root;
  }

  /** Would this request be allowed? */
  wouldAllow(request: PolicyRequest): SimulationResult {
    const explanation = this._explainer.explain(this._root, request);
    return { request, effect: explanation.decision, explanation };
  }

  /** Run the expected-outcome suite. */
  runSuite(scenarios: ReadonlyArray<Scenario>): ScenarioReport {
    const outcomes: ScenarioOutcome[] = scenarios.map((s) => {
      const r = this.wouldAllow(s.request);
      const passed = r.effect === s.expect;
      return {
        scenario: s,
        actual: r.effect,
        passed,
        narrative: passed ? undefined : this._explainer.narrative(r.explanation),
      };
    });
    const passed = outcomes.filter((o) => o.passed).length;
    return { total: outcomes.length, passed, failed: outcomes.length - passed, outcomes };
  }

  /**
   * Vary `category.path` over `values`, holding the rest of `request`
   * fixed. Reports the effect at each point and where it flips.
   */
  attributeSweep(
    request: PolicyRequest,
    category: 'subject' | 'resource' | 'action' | 'environment',
    path: string,
    values: ReadonlyArray<unknown>
  ): SweepReport {
    const points: SweepPoint[] = [];
    const effectsSeen: DecisionEffect[] = [];
    const boundaries: number[] = [];
    let last: DecisionEffect | null = null;

    values.forEach((v, i) => {
      const mutated = setAttr(request, category, path, v);
      const effect = this.wouldAllow(mutated).effect;
      points.push({ value: v, effect });
      if (!effectsSeen.includes(effect)) effectsSeen.push(effect);
      if (last !== null && effect !== last) boundaries.push(i);
      last = effect;
    });

    return { category, path, points, effects: effectsSeen, boundaries };
  }
}

/** Immutable attribute setter — writes `path` into `request[category]`. */
function setAttr(
  req: PolicyRequest,
  category: 'subject' | 'resource' | 'action' | 'environment',
  path: string,
  value: unknown
): PolicyRequest {
  const bag = { ...(category === 'action' && typeof req.action === 'string' ? { id: req.action } : (req[category] as Record<string, unknown> | undefined) ?? {}) };
  const segs = path.split('.');
  let cursor: Record<string, unknown> = bag;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cursor[segs[i]];
    cursor[segs[i]] = next !== null && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {};
    cursor = cursor[segs[i]] as Record<string, unknown>;
  }
  cursor[segs[segs.length - 1]] = value;
  return { ...req, [category]: bag };
}
