/**
 * Cost Forecaster — trend + seasonality decomposition
 *
 * Predicts future daily spend from a history of daily observations by
 * decomposing the series into:
 *
 *   spend(t) = trend(t) × seasonalIndex(dayOfWeek(t))
 *
 * - **Trend**: ordinary least-squares linear regression on (dayIndex,
 *   spend). OLS is closed-form, deterministic, and matches how FinOps
 *   teams eyeball "run-rate drift" — a robust starting point before
 *   reaching for Holt-Winters.
 *
 *        slope = Σ(x-x̄)(y-ȳ) / Σ(x-x̄)²,  intercept = ȳ - slope·x̄
 *
 * - **Seasonal index**: ratio of each weekday's mean detrended spend to
 *   the overall mean (multiplicative model). Weekly seasonality is the
 *   dominant real-world cloud-cost pattern — weekday batch workloads,
 *   weekend troughs.
 *
 * - **Prediction intervals**: residual standard error scaled by the
 *   t-critical band approximation `± z·σ·√(1 + 1/n + (x-x̄)²/Σ(x-x̄)²)` —
 *   widens naturally further from the observed centroid, matching how
 *   honest forecasters communicate uncertainty.
 *
 * The forecaster also exposes a decomposition report (what fraction of
 * variance is trend vs seasonal vs residual) — the R²-style diagnostic
 * real cost analytics tools surface.
 *
 * Complexity: O(n) fit, O(1) predict.
 *
 * @module CostOptimization/Engine2
 */

import { DAY_MS } from '../engines/types';

/** One daily spend observation. */
export interface DailySpend {
  /** Epoch ms of the day boundary (UTC-normalised by caller). */
  readonly day: number;
  readonly amountCents: number;
}

/** A forecast for one future day. */
export interface ForecastPoint {
  readonly day: number;
  readonly predictedCents: number;
  /** Lower bound of the prediction interval (default 95%). */
  readonly lowerCents: number;
  readonly upperCents: number;
  /** Width of the interval — grows with distance from the data. */
  readonly intervalWidth: number;
}

/** Fitted model summary — useful for debugging odd forecasts. */
export interface ForecastModel {
  readonly slopeCentsPerDay: number;
  readonly interceptCents: number;
  /** Mean of the training series. */
  readonly meanCents: number;
  /** R² of the trend component (fraction of variance explained). */
  readonly rSquared: number;
  /** Seasonal index per ISO weekday (0=Mon … 6=Sun); 1.0 = neutral. */
  readonly seasonalIndex: readonly number[];
  /** Residual standard error in cents. */
  readonly residualStdErr: number;
  readonly sampleCount: number;
  /** Fraction of variance explained by seasonality alone. */
  readonly seasonalVarianceRatio: number;
}

/** Forecaster tuning. */
export interface ForecastConfig {
  /** Minimum observations required to fit. Default 14. */
  readonly minSamples: number;
  /** Minimum days of history needed to compute seasonal indices. Default 14. */
  readonly minDaysForSeasonality: number;
  /**
   * z for the prediction interval (1.96 = 95%). Default 1.96.
   */
  readonly intervalZ: number;
  /**
   * Winsorisation cap: seasonal indices are clamped to
   * [1/winsorize, winsorize] to stop a single outlier week
   * (e.g. Black Friday) from skewing every forecast. Default 3.
   */
  readonly seasonalWinsorize: number;
}

export const DEFAULT_FORECAST_CONFIG: ForecastConfig = {
  minSamples: 14,
  minDaysForSeasonality: 14,
  intervalZ: 1.96,
  seasonalWinsorize: 3,
};

/** Raised when there isn't enough history to fit. */
export class InsufficientHistoryError extends Error {
  constructor(have: number, need: number) {
    super(`need ≥${need} daily observations, got ${have}`);
    this.name = 'InsufficientHistoryError';
  }
}

/** ISO weekday 0=Monday … 6=Sunday (epoch-day arithmetic). */
export function weekdayOf(dayMs: number): number {
  // 1970-01-01 was a Thursday (ISO day 3 if Mon=0). Floor to day count,
  // shift so Monday=0.
  const day = Math.floor(dayMs / DAY_MS);
  return (((day + 3) % 7) + 7) % 7;
}

/**
 * CostForecaster — OLS trend × weekly seasonal index.
 */
export class CostForecaster {
  private readonly _config: ForecastConfig;

  constructor(config: Partial<ForecastConfig> = {}) {
    this._config = { ...DEFAULT_FORECAST_CONFIG, ...config };
  }

  /**
   * Fit the model to a daily-spend history and return the parameters.
   * Throws InsufficientHistoryError below `minSamples`.
   */
  fit(history: readonly DailySpend[]): ForecastModel {
    const cfg = this._config;
    if (history.length < cfg.minSamples) {
      throw new InsufficientHistoryError(history.length, cfg.minSamples);
    }
    // Sort by day — callers may pass unordered series.
    const sorted = history.slice().sort((a, b) => a.day - b.day);
    const n = sorted.length;

    // Day index: x = integer days since first observation.
    const x0 = Math.floor(sorted[0].day / DAY_MS);
    const xs = sorted.map((s) => Math.floor(s.day / DAY_MS) - x0);
    const ys = sorted.map((s) => s.amountCents);

    // OLS — closed form, single pass via sums.
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
    const mean = sy / n;
    const xbar = sx / n;
    const intercept = mean - slope * xbar;

    // R² of the linear trend.
    let ssTot = 0;
    let ssRes = 0;
    const trendAt = (x: number) => intercept + slope * x;
    for (let i = 0; i < n; i++) {
      const res = ys[i] - trendAt(xs[i]);
      ssRes += res * res;
      ssTot += (ys[i] - mean) * (ys[i] - mean);
    }
    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    // Seasonal indices from detrended ratios.
    const seasonal = new Array<number>(7).fill(1);
    if (n >= cfg.minDaysForSeasonality) {
      const sums = new Array<number>(7).fill(0);
      const counts = new Array<number>(7).fill(0);
      for (let i = 0; i < n; i++) {
        const t = trendAt(xs[i]);
        const wd = weekdayOf(sorted[i].day);
        if (t > 0) {
          sums[wd] += ys[i] / t; // multiplicative ratio
          counts[wd]++;
        }
      }
      for (let d = 0; d < 7; d++) {
        if (counts[d] > 0) {
          const idx = sums[d] / counts[d];
          seasonal[d] = Math.min(cfg.seasonalWinsorize, Math.max(1 / cfg.seasonalWinsorize, idx));
        }
      }
      // Renormalise so the indices average to 1 — keeps the level anchored.
      const meanIdx = seasonal.reduce((a, b) => a + b, 0) / 7;
      if (meanIdx > 0) {
        for (let d = 0; d < 7; d++) seasonal[d] /= meanIdx;
      }
    }

    // Residual std error on full model (trend × seasonal).
    let fullRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = trendAt(xs[i]) * seasonal[weekdayOf(sorted[i].day)];
      const r = ys[i] - pred;
      fullRes += r * r;
    }
    const residualStdErr = n > 2 ? Math.sqrt(fullRes / (n - 2)) : 0;

    // Seasonal variance ratio: how much of total variance the seasonal
    // component alone explains after removing the trend.
    let seasonalExplained = 0;
    const meanRatio =
      n >= cfg.minDaysForSeasonality
        ? seasonal.reduce((a, b) => a + b, 0) / 7
        : 1;
    for (let i = 0; i < n; i++) {
      const wd = weekdayOf(sorted[i].day);
      const dev = (seasonal[wd] - meanRatio) * trendAt(xs[i]);
      seasonalExplained += dev * dev;
    }
    const seasonalVarianceRatio = ssTot === 0 ? 0 : Math.min(1, seasonalExplained / ssTot);

    return {
      slopeCentsPerDay: slope,
      interceptCents: intercept,
      meanCents: mean,
      rSquared,
      seasonalIndex: seasonal,
      residualStdErr,
      sampleCount: n,
      seasonalVarianceRatio,
    };
  }

  /**
   * Predict spend for a future day (epoch ms at any time within the day).
   * `history` is refit each call — cheap enough at daily granularity.
   */
  predict(history: readonly DailySpend[], targetDay: number, model?: ForecastModel): ForecastPoint {
    const m = model ?? this.fit(history);
    const sorted = history.slice().sort((a, b) => a.day - b.day);
    const x0 = Math.floor(sorted[0].day / DAY_MS);
    const x = Math.floor(targetDay / DAY_MS) - x0;
    const predicted = Math.max(0, (m.interceptCents + m.slopeCentsPerDay * x) * m.seasonalIndex[weekdayOf(targetDay)]);

    // Prediction interval widens with distance from x̄.
    const n = m.sampleCount;
    const xs = sorted.map((s) => Math.floor(s.day / DAY_MS) - x0);
    const xbar = xs.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, b) => a + (b - xbar) * (b - xbar), 0);
    const leverage = sxx === 0 ? 1 / n : 1 / n + ((x - xbar) * (x - xbar)) / sxx;
    const halfWidth = this._config.intervalZ * m.residualStdErr * Math.sqrt(1 + leverage);

    return {
      day: targetDay,
      predictedCents: predicted,
      lowerCents: Math.max(0, predicted - halfWidth),
      upperCents: predicted + halfWidth,
      intervalWidth: halfWidth,
    };
  }

  /**
   * Forecast a horizon of `days` starting at `startDay`.
   */
  forecast(
    history: readonly DailySpend[],
    startDay: number,
    days: number
  ): ForecastPoint[] {
    const model = this.fit(history);
    const out: ForecastPoint[] = [];
    for (let i = 0; i < days; i++) {
      out.push(this.predict(history, startDay + i * DAY_MS, model));
    }
    return out;
  }

  /**
   * Projected spend for a whole calendar period (e.g. "rest of month").
   * Sums daily forecasts — cheap because the model is fitted once.
   */
  projectTotal(history: readonly DailySpend[], startDay: number, days: number): {
    totalCents: number;
    daily: ForecastPoint[];
  } {
    const daily = this.forecast(history, startDay, days);
    return { totalCents: daily.reduce((a, p) => a + p.predictedCents, 0), daily };
  }
}
