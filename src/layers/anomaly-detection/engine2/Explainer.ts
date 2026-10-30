/**
 * Anomaly Explanation — which feature contributed most.
 *
 * For multivariate points (vectors), attributes the anomaly score to
 * individual features so on-call can answer "why is this point weird?"
 *
 * Two complementary attributors:
 *
 *   - `ZScoreExplainer`: per-feature |z| against running Welford stats;
 *     contribution = z_i² / Σz². Cheap, O(d).
 *   - `LeaveOneOutExplainer`: re-score the point with each feature
 *     replaced by its mean — the feature whose removal drops the score
 *     most is the driver (Shapley-lite, O(d · score)).
 *
 * Both rank features by contribution and emit human-readable text.
 *
 * @module AnomalyDetection/Engine2
 */

import { WelfordEstimator } from './Welford';

export interface FeatureContribution {
  readonly feature: string;
  readonly value: number;
  readonly z: number;
  /** Share of total contribution, [0,1]. */
  readonly share: number;
}

export interface Explanation {
  readonly contributions: readonly FeatureContribution[]; // sorted desc
  readonly topFeature?: string;
  readonly text: string;
}

/**
 * Per-feature running stats; explains a vector by relative z-scores.
 * Must be fed the same stream it's asked to explain (prequential).
 */
export class ZScoreExplainer {
  private readonly ests = new Map<string, WelfordEstimator>();
  private readonly order: string[] = [];

  constructor(private readonly decay = 1) {}

  /** Update stats with a new observation. O(d). */
  observe(point: Readonly<Record<string, number>>): void {
    for (const [k, v] of Object.entries(point)) {
      let e = this.ests.get(k);
      if (!e) {
        e = new WelfordEstimator(this.decay);
        this.ests.set(k, e);
        this.order.push(k);
      }
      e.add(v);
    }
  }

  /** Explain one point against current stats (does not mutate). */
  explain(point: Readonly<Record<string, number>>): Explanation {
    const parts: Array<{ f: string; v: number; z: number }> = [];
    let totalSq = 0;
    for (const k of this.order) {
      const e = this.ests.get(k)!;
      const v = point[k];
      if (v === undefined) continue;
      const sd = e.stddev;
      const z = sd > 0 ? Math.abs((v - e.mean) / sd) : v === e.mean ? 0 : Number.POSITIVE_INFINITY;
      parts.push({ f: k, v, z });
      if (Number.isFinite(z)) totalSq += z * z;
    }
    const contributions: FeatureContribution[] = parts
      .map((p) => ({
        feature: p.f,
        value: p.v,
        z: p.z,
        share: totalSq > 0 ? (Number.isFinite(p.z) ? (p.z * p.z) / totalSq : 1) : 0,
      }))
      .sort((a, b) => b.share - a.share);

    const top = contributions[0];
    const text = top
      ? `top contributor '${top.feature}' = ${top.value.toFixed(2)} (z=${top.z === Infinity ? '∞' : top.z.toFixed(2)}, ${(top.share * 100).toFixed(0)}% of score)`
      : 'no features';
    return { contributions, topFeature: top?.feature, text };
  }

  statsFor(feature: string): { mean: number; stddev: number; n: number } | undefined {
    const e = this.ests.get(feature);
    return e ? { mean: e.mean, stddev: e.stddev, n: e.count } : undefined;
  }
}

/**
 * Leave-one-out attribution against an arbitrary scorer. For each
 * feature: replace it with the supplied baseline (default: the running
 * mean from a paired ZScoreExplainer) and measure the score drop.
 * Positive drop ⇒ the feature drove the anomaly.
 */
export class LeaveOneOutExplainer {
  constructor(
    /** Score a full feature vector; higher = more anomalous. */
    private readonly scorer: (point: Readonly<Record<string, number>>) => number,
    private readonly baseline?: (feature: string) => number
  ) {}

  explain(
    point: Readonly<Record<string, number>>,
    fallbackBaseline = 0
  ): Explanation {
    const keys = Object.keys(point);
    const full = this.scorer(point);
    const parts: FeatureContribution[] = [];
    let totalDrop = 0;
    const drops = new Map<string, number>();

    for (const k of keys) {
      const ablated = { ...point };
      ablated[k] = this.baseline ? this.baseline(k) : fallbackBaseline;
      const drop = Math.max(0, full - this.scorer(ablated));
      drops.set(k, drop);
      totalDrop += drop;
    }
    for (const k of keys) {
      const drop = drops.get(k) ?? 0;
      parts.push({
        feature: k,
        value: point[k],
        z: 0,
        share: totalDrop > 0 ? drop / totalDrop : 0,
      });
    }
    parts.sort((a, b) => b.share - a.share);
    const top = parts[0];
    const text = top
      ? `removing '${top.feature}' drops the score by ${(top.share * 100).toFixed(0)}%`
      : 'no features';
    return { contributions: parts, topFeature: top?.feature, text };
  }
}
