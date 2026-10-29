/**
 * Canary Deploy — Kayenta-style Canary Judge
 *
 * Aggregate scoring across metric groups, modeled on Netflix Kayenta's judge:
 * each metric gate belongs to a weighted group (e.g. errors 60%, latency 40%);
 * the group score is the fraction of its gates that passed (weighted by gate
 * importance); the canary score is the weighted sum of group scores. A rollout
 * is judged PASS when score ≥ passThreshold and no group scores 0 (a total
 * group failure can't be averaged away by other groups — the Kayenta
 * "marginal fail" rule).
 *
 * Also computes a classification: PASS / MARGINAL (between marginal & pass
 * thresholds → extend analysis rather than rollback) / FAIL.
 *
 * @module CanaryDeploy/Canary
 */

import { GateVerdict, MetricGate } from './CanaryTypes';

export interface MetricGroup {
  readonly name: string;
  /** Group weight in the total score (weights need not sum to 1 — normalized). */
  readonly weight: number;
  /** Gate names belonging to this group. */
  readonly gates: ReadonlyArray<string>;
}

export interface JudgeThresholds {
  /** Score ≥ pass → rollout proceeds. */
  readonly pass: number;
  /** marginal ≤ score < pass → inconclusive, re-soak (default pass*0.75). */
  readonly marginal?: number;
}

export type JudgeClassification = 'PASS' | 'MARGINAL' | 'FAIL';

export interface GroupScore {
  readonly group: string;
  readonly weight: number;
  /** Fraction of gates passed inside the group. */
  readonly score: number;
  readonly passedGates: number;
  readonly totalGates: number;
}

export interface JudgeResult {
  readonly classification: JudgeClassification;
  /** Weighted aggregate score ∈ [0,1]. */
  readonly score: number;
  readonly groups: ReadonlyArray<GroupScore>;
  /** True when a group scored 0 — forces FAIL regardless of aggregate. */
  readonly fatalGroupFailure: boolean;
}

export class CanaryJudge {
  private readonly _groups: ReadonlyArray<MetricGroup>;
  private readonly _thresholds: JudgeThresholds;
  private readonly _gateImportance = new Map<string, number>();

  constructor(
    groups: ReadonlyArray<MetricGroup>,
    thresholds: JudgeThresholds,
    gates?: ReadonlyArray<MetricGate>
  ) {
    if (groups.length === 0) throw new Error('at least one metric group required');
    for (const g of groups) {
      if (g.weight <= 0) throw new RangeError(`group '${g.name}' weight must be positive`);
    }
    if (!(thresholds.pass > 0 && thresholds.pass <= 1)) {
      throw new RangeError('pass threshold must be in (0,1]');
    }
    this._groups = groups;
    this._thresholds = thresholds;
    for (const g of gates ?? []) {
      // Equal importance by default; a dedicated field could tune per-gate.
      this._gateImportance.set(g.name, 1);
    }
  }

  setGateImportance(gateName: string, importance: number): void {
    this._gateImportance.set(gateName, importance);
  }

  /**
   * Score a set of gate verdicts. Gates not assigned to any group contribute
   * to a synthetic 'ungrouped' group with weight 1 — nothing is silently
   * dropped from the judgment.
   */
  judge(verdicts: ReadonlyArray<GateVerdict>): JudgeResult {
    const byGate = new Map(verdicts.map((v) => [v.gate, v]));
    const groups: GroupScore[] = [];
    let weightedSum = 0;
    let totalWeight = 0;
    let fatal = false;

    const scoreGroup = (name: string, weight: number, gateNames: ReadonlyArray<string>): void => {
      let earned = 0;
      let possible = 0;
      let passedCount = 0;
      for (const gn of gateNames) {
        const v = byGate.get(gn);
        if (!v) continue;
        const imp = this._gateImportance.get(gn) ?? 1;
        possible += imp;
        if (v.passed) {
          earned += imp;
          passedCount++;
        }
      }
      const score = possible > 0 ? earned / possible : 1;
      groups.push({ group: name, weight, score, passedGates: passedCount, totalGates: gateNames.length });
      weightedSum += weight * score;
      totalWeight += weight;
      if (possible > 0 && score === 0) fatal = true;
    };

    const grouped = new Set<string>();
    for (const g of this._groups) {
      scoreGroup(g.name, g.weight, g.gates);
      g.gates.forEach((x) => grouped.add(x));
    }
    const ungrouped = verdicts.filter((v) => !grouped.has(v.gate)).map((v) => v.gate);
    if (ungrouped.length > 0) {
      scoreGroup('ungrouped', 1, ungrouped);
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const marginal = this._thresholds.marginal ?? this._thresholds.pass * 0.75;
    const classification: JudgeClassification = fatal
      ? 'FAIL'
      : score >= this._thresholds.pass
        ? 'PASS'
        : score >= marginal
          ? 'MARGINAL'
          : 'FAIL';

    return { classification, score, groups, fatalGroupFailure: fatal };
  }
}
