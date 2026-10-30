/**
 * Onboarding Engine2 — Abandonment Predictor
 *
 * FunnelAnalytics tells you WHERE users drop; this predicts WHICH
 * in-flight runs are about to drop — the input a re-engagement campaign
 * consumes to prioritize outreach before it's too late.
 *
 * Model: per-step empirical abandonment rates form a baseline. A run's
 * risk score combines three signals, each normalized to [0,1]:
 *
 *   1. Dwell-ratio: time on current step ÷ that step's historical median
 *      dwell. Ration >1 means the user is slower than typical; saturates
 *      via 1 − e^(−ratio) so a 10× dwell doesn't dominate.
 *   2. Step risk: historical abandon rate AT the current step.
 *   3. Momentum: fraction of visited steps the user completed vs skipped
 *      — serial skippers abandon more.
 *
 * Score = weighted sum; runs are bucketed low/medium/high for action.
 * The baseline trains from completed+still-running snapshots — no
 * labels needed, purely observational statistics.
 *
 * Complexity: train O(runs × steps); score O(steps visited).
 *
 * @module OnboardingLayer/Engine2
 */

import { FlowDefinition, StepId } from '../flow/FlowTypes';
import { RunSnapshot } from './OnboardingAnalytics';

/** Minimal per-run timing the predictor needs beyond RunSnapshot. */
export interface TimedRun extends RunSnapshot {
  /** Per-step dwell ms in visit order (parallel to `visited`). */
  readonly dwellMs: readonly number[];
  /** How many visited steps were skipped (not completed). */
  readonly skippedCount?: number;
  /** ms since lastActiveAt (idle time). */
  readonly idleMs?: number;
}

export interface RiskScore {
  readonly runId: string;
  readonly score: number; // [0,1]
  readonly bucket: 'low' | 'medium' | 'high';
  readonly signals: {
    readonly dwellRatio: number;
    readonly stepRisk: number;
    readonly skipMomentum: number;
    readonly idle: number;
  };
}

export interface PredictorWeights {
  readonly dwell?: number;
  readonly stepRisk?: number;
  readonly skipMomentum?: number;
  readonly idle?: number;
}

interface StepStats {
  dwells: number[]; // sorted on demand
  abandoned: number;
  exited: number; // completed visits (advanced or finished the flow)
}

const MEDIAN = (sorted: number[]): number => {
  if (sorted.length === 0) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
};

export class AbandonmentPredictor {
  private readonly _stats = new Map<StepId, StepStats>();
  private readonly _w: Required<PredictorWeights>;
  /** Median dwell across all steps — fallback for unseen steps. */
  private _globalMedian = 0;
  private _trained = false;

  constructor(weights?: PredictorWeights) {
    this._w = {
      dwell: weights?.dwell ?? 0.35,
      stepRisk: weights?.stepRisk ?? 0.25,
      skipMomentum: weights?.skipMomentum ?? 0.2,
      idle: weights?.idle ?? 0.2,
    };
  }

  /**
   * Fit per-step stats from historical runs. Completed runs contribute
   * dwell data; abandoned runs (visited but not completed, no currentStep)
   * contribute the abandonment count at their LAST visited step.
   */
  train(def: FlowDefinition, runs: readonly TimedRun[]): void {
    this._stats.clear();
    const order = new Set(def.steps.map((s) => s.id));
    const allDwells: number[] = [];

    for (const run of runs) {
      for (let i = 0; i < run.visited.length; i++) {
        const stepId = run.visited[i];
        if (!order.has(stepId)) continue;
        let s = this._stats.get(stepId);
        if (!s) {
          s = { dwells: [], abandoned: 0, exited: 0 };
          this._stats.set(stepId, s);
        }
        const dwell = run.dwellMs[i] ?? 0;
        s.dwells.push(dwell);
        allDwells.push(dwell);
        const isLast = i === run.visited.length - 1;
        if (run.completed) {
          s.exited++;
        } else if (isLast && run.currentStep === null) {
          s.abandoned++; // died on this step
        } else if (!isLast) {
          s.exited++; // moved past it
        }
      }
    }
    allDwells.sort((a, b) => a - b);
    this._globalMedian = MEDIAN(allDwells);
    this._trained = true;
  }

  /**
   * Score a live run. Untrained predictors throw — a zero-data model is
   * worse than no model.
   */
  score(run: TimedRun): RiskScore {
    if (!this._trained) throw new Error('predictor not trained');
    const cur = run.currentStep;
    if (cur === null) {
      return {
        runId: run.runId,
        score: run.completed ? 0 : 1,
        bucket: run.completed ? 'low' : 'high',
        signals: { dwellRatio: 0, stepRisk: run.completed ? 0 : 1, skipMomentum: 0, idle: 0 },
      };
    }

    const s = this._stats.get(cur);
    const lastIdx = run.visited.length - 1;
    const dwell = lastIdx >= 0 ? run.dwellMs[lastIdx] ?? 0 : 0;
    const median = s && s.dwells.length > 0 ? MEDIAN([...s.dwells].sort((a, b) => a - b)) : this._globalMedian;
    const ratio = median > 0 ? dwell / median : 0;
    const dwellSignal = 1 - Math.exp(-ratio); // saturating transform

    const stepRisk =
      s && s.abandoned + s.exited > 0 ? s.abandoned / (s.abandoned + s.exited) : 0;

    const visited = run.visited.length;
    const skipMomentum = visited === 0 ? 0 : (run.skippedCount ?? 0) / visited;

    // Idle: same saturating transform against a 24h reference window.
    const idle = 1 - Math.exp(-(run.idleMs ?? 0) / (24 * 3600_000));

    const score =
      this._w.dwell * dwellSignal +
      this._w.stepRisk * stepRisk +
      this._w.skipMomentum * skipMomentum +
      this._w.idle * idle;

    return {
      runId: run.runId,
      score,
      bucket: score >= 0.66 ? 'high' : score >= 0.33 ? 'medium' : 'low',
      signals: {
        dwellRatio: dwellSignal,
        stepRisk,
        skipMomentum,
        idle,
      },
    };
  }

  /** Rank a batch of live runs by descending risk — campaign triage order. */
  rank(runs: readonly TimedRun[]): RiskScore[] {
    return runs.map((r) => this.score(r)).sort((a, b) => b.score - a.score);
  }
}
