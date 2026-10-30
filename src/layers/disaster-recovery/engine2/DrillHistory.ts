/**
 * Drill History & Regression Detection
 *
 * One drill proves the failover *can* work; a series proves it *keeps*
 * working. This module tracks drill outcomes over time and answers the
 * question the SRE review actually asks: is our recovery getting
 * slower?
 *
 * `regression` compares the most recent drill's measured durations to
 * the running median of earlier drills — a simple, robust detector
 * (medians shrug off the one slow drill that always happens; means
 * don't). A drill that exceeds its predecessors' median by the
 * `factor` threshold flags a regression worth investigating before
 * the next real failover.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { DrillOutcome } from './FailoverDrill';
import { ObjectiveResult } from './types';

export interface RegressionReport {
  readonly drill: DrillOutcome;
  /** Median of earlier drills' totalRecoveryMs; null when no baseline. */
  readonly baselineMs: number | null;
  readonly actualMs: number;
  /** actual / baseline; null without baseline. */
  readonly factor: number | null;
  readonly regressed: boolean;
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const mid = Math.floor(n / 2);
  const v = n % 2 === 1 ? s[mid] : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
  return v ?? 0;
}

export class DrillHistory {
  private readonly _outcomes: DrillOutcome[] = [];

  record(outcome: DrillOutcome): void {
    this._outcomes.push(outcome);
  }

  get outcomes(): readonly DrillOutcome[] {
    return this._outcomes;
  }

  /**
   * Is the latest drill a regression on the running baseline? Needs at
   * least `minBaseline` earlier drills to judge; otherwise returns
   * `regressed: false` with a null factor — you cannot regress without
   * history.
   */
  regression(factor = 1.5, minBaseline = 2): RegressionReport {
    const last = this._outcomes[this._outcomes.length - 1];
    if (!last) {
      return {
        drill: undefined as unknown as DrillOutcome,
        baselineMs: null,
        actualMs: 0,
        factor: null,
        regressed: false,
      };
    }
    const earlier = this._outcomes.slice(0, -1).map((o) => o.objective.totalRecoveryMs);
    if (earlier.length < minBaseline) {
      return {
        drill: last,
        baselineMs: earlier.length > 0 ? median(earlier) : null,
        actualMs: last.objective.totalRecoveryMs,
        factor: null,
        regressed: false,
      };
    }
    const base = median(earlier);
    const actual = last.objective.totalRecoveryMs;
    const f = base === 0 ? null : actual / base;
    return {
      drill: last,
      baselineMs: base,
      actualMs: actual,
      factor: f,
      regressed: f !== null && f > factor,
    };
  }

  /** Successive score trajectory for charting. */
  scores(): readonly number[] {
    return this._outcomes.map((o) => o.score);
  }

  /** Objective results for the maturity scorer. */
  objectives(): readonly ObjectiveResult[] {
    return this._outcomes.map((o) => o.objective);
  }
}
