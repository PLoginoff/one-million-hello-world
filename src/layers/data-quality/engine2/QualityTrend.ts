/**
 * Quality Trend Tracking & Regression Detection
 *
 * A score at a point in time is a snapshot; what ops teams actually
 * watch is the *trend* — "has quality been degrading for a week?" This
 * module records composite scores over time and detects meaningful
 * regressions using two complementary detectors:
 *
 *   1. Linear regression on the last N points — OLS slope with a
 *      significance test. A sustained negative slope that explains a
 *      decent share of variance (R²) is a *trend*; a noisy sawtooth is
 *      not.
 *
 *   2. Change-point detection on the mean shift — the classic
 *      two-sided CUSUM used in manufacturing SPC: split the series at
 *      each candidate point, compare windowed means before/after, and
 *      flag the largest significant gap. Catches sudden step-downs the
 *      slope detector misses.
 *
 * The detector reports a `RegressionAlert` when either fires, ranked
 * by severity (sustained > sudden) — the same tiering anomaly tooling
 * uses to decide paging vs ticket.
 *
 * Injectable clock keeps tests deterministic.
 *
 * Complexity: O(n) append, O(n) per trend analysis (OLS + CUSUM scan).
 *
 * @module DataQuality/Engine2
 */

/** Injectable clock — epoch ms. Keeps tests deterministic. */
export interface QualityClock {
  now(): number;
}

export class SystemQualityClock implements QualityClock {
  now(): number {
    return Date.now();
  }
}

/** One recorded quality observation. */
export interface ScoreObservation {
  readonly at: number;
  readonly score: number;
  /** Optional label — dataset/table/contract id. */
  readonly series?: string;
}

/** Result of the slope detector. */
export interface TrendAnalysis {
  readonly points: readonly ScoreObservation[];
  /** OLS slope in score-points per day. */
  readonly slopePerDay: number;
  /** R² — how much of the variance the trend explains. */
  readonly rSquared: number;
  /** True when the slope is negative and R² ≥ minRSquared. */
  readonly degrading: boolean;
  /** Estimated days until the series crosses `floor`. */
  readonly daysToFloor: number | null;
}

/** Result of the change-point (CUSUM) detector. */
export interface ChangePoint {
  /** Index into the series where the regime shift occurs. */
  readonly index: number;
  readonly at: number;
  /** Mean score before the shift. */
  readonly meanBefore: number;
  /** Mean score after the shift. */
  readonly meanAfter: number;
  /** (meanBefore - meanAfter) / pooledStddev — effect size. */
  readonly significance: number;
}

/** A fired regression alert. */
export interface RegressionAlert {
  readonly series: string;
  readonly kind: 'trend' | 'change-point' | 'both';
  readonly severity: 'warning' | 'critical';
  readonly detectedAt: number;
  readonly trend: TrendAnalysis;
  readonly changePoint: ChangePoint | undefined;
  readonly summary: string;
}

/** Detector tuning. */
export interface TrendConfig {
  /** Minimum points required for any analysis. Default 5. */
  readonly minPoints: number;
  /** Minimum R² for the slope to count as a real trend. Default 0.4. */
  readonly minRSquared: number;
  /** Minimum negative slope (score-points/day) to alert. Default -0.5. */
  readonly alertSlope: number;
  /** Score floor used for days-to-floor projection. Default 60. */
  readonly floor: number;
  /**
   * Minimum |significance| (in pooled-σ units) for a change-point to
   * count. Default 1.5.
   */
  readonly minChangePointSignificance: number;
  /** Points at the edges skipped by the change-point scan. Default 3. */
  readonly changePointEdgeMargin: number;
  /** Lookback window for trend analysis in ms (default: all history). */
  readonly windowMs: number | null;
}

export const DEFAULT_TREND_CONFIG: TrendConfig = {
  minPoints: 5,
  minRSquared: 0.4,
  alertSlope: -0.5,
  floor: 60,
  minChangePointSignificance: 1.5,
  changePointEdgeMargin: 3,
  windowMs: null,
};

/**
 * QualityTrendTracker — score history with regression detection.
 */
export class QualityTrendTracker {
  private readonly _series = new Map<string, ScoreObservation[]>();
  private readonly _config: TrendConfig;
  private readonly _clock: QualityClock;

  constructor(config: Partial<TrendConfig> = {}, clock: QualityClock = new SystemQualityClock()) {
    this._config = { ...DEFAULT_TREND_CONFIG, ...config };
    this._clock = clock;
  }

  /** Record a score for a series (default series id ''). */
  record(series: string, score: number, at?: number): void {
    let arr = this._series.get(series);
    if (arr === undefined) {
      arr = [];
      this._series.set(series, arr);
    }
    arr.push({ at: at ?? this._clock.now(), score, series });
  }

  /** Raw history for a series, chronological. */
  history(series: string): readonly ScoreObservation[] {
    const arr = this._series.get(series) ?? [];
    return arr.slice().sort((a, b) => a.at - b.at);
  }

  /** All tracked series ids. */
  series(): string[] {
    return [...this._series.keys()];
  }

  /**
   * OLS trend analysis over the (optionally windowed) history.
   * Returns null when there aren't enough points.
   */
  trend(series: string): TrendAnalysis | null {
    const cfg = this._config;
    let pts = this.history(series).slice();
    if (cfg.windowMs !== null) {
      const cutoff = this._clock.now() - cfg.windowMs;
      pts = pts.filter((p) => p.at >= cutoff);
    }
    if (pts.length < cfg.minPoints) return null;
    const n = pts.length;
    const xs = pts.map((p) => p.at / 86_400_000); // days since epoch
    const ys = pts.map((p) => p.score);
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
    const denom = n * sxx - sx * sx;
    const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
    const meanY = sy / n;
    const xbar = sx / n;
    const intercept = meanY - slope * xbar;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - (intercept + slope * xs[i]);
      ssRes += r * r;
      ssTot += (ys[i] - meanY) * (ys[i] - meanY);
    }
    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const degrading = slope < cfg.alertSlope && rSquared >= cfg.minRSquared;
    const current = ys[n - 1];
    const daysToFloor =
      slope < 0 && current > cfg.floor ? (current - cfg.floor) / -slope : null;
    return { points: pts, slopePerDay: slope, rSquared, degrading, daysToFloor };
  }

  /**
   * CUSUM-style change-point scan: find the split that maximises the
   * mean-shift significance. Returns null when history is too short.
   */
  detectChangePoint(series: string): ChangePoint | null {
    const pts = this.history(series);
    const cfg = this._config;
    const edge = cfg.changePointEdgeMargin;
    if (pts.length < cfg.minPoints || pts.length < edge * 2 + 1) return null;

    // Global stats for pooling.
    const mean = pts.reduce((a, p) => a + p.score, 0) / pts.length;
    const sd = Math.sqrt(
      pts.reduce((a, p) => a + (p.score - mean) * (p.score - mean), 0) / pts.length
    );
    if (sd === 0) return null;

    let best: ChangePoint | null = null;
    for (let i = edge; i <= pts.length - edge; i++) {
      const before = pts.slice(0, i);
      const after = pts.slice(i);
      const mb = before.reduce((a, p) => a + p.score, 0) / before.length;
      const ma = after.reduce((a, p) => a + p.score, 0) / after.length;
      const sig = (mb - ma) / sd;
      if (Math.abs(sig) >= cfg.minChangePointSignificance) {
        if (best === null || Math.abs(sig) > Math.abs(best.significance)) {
          best = { index: i, at: pts[i].at, meanBefore: mb, meanAfter: ma, significance: sig };
        }
      }
    }
    return best;
  }

  /**
   * Full regression analysis: trend + change-point combined.
   * Returns null when there is nothing to report.
   */
  analyze(series: string): RegressionAlert | null {
    const trend = this.trend(series);
    if (trend === null) return null;
    const cp = this.detectChangePoint(series);
    const trendFired = trend.degrading;
    const cpFired = cp !== null && cp.meanAfter < cp.meanBefore;
    if (!trendFired && !cpFired) return null;

    const kind = trendFired && cpFired ? 'both' : trendFired ? 'trend' : 'change-point';
    const severity =
      kind === 'both' || (cp !== null && cp.meanAfter < this._config.floor)
        ? 'critical'
        : 'warning';
    const parts: string[] = [];
    if (trendFired) {
      parts.push(`slope ${trend.slopePerDay.toFixed(2)}/day (R²=${trend.rSquared.toFixed(2)})`);
      if (trend.daysToFloor !== null) {
        parts.push(`floor in ~${trend.daysToFloor.toFixed(0)}d`);
      }
    }
    if (cpFired && cp !== null) {
      parts.push(`step-down at index ${cp.index} (${cp.meanBefore.toFixed(1)} → ${cp.meanAfter.toFixed(1)})`);
    }
    return {
      series,
      kind,
      severity,
      detectedAt: this._clock.now(),
      trend,
      changePoint: cp ?? undefined,
      summary: parts.join('; '),
    };
  }
}
