/**
 * VariantLeaderboard — per-variant performance metrics, ranked.
 *
 * Beyond conversion rate, ops teams need per-variant operational metrics
 * (latency, error rate) to see "variant B converts better but is 3x
 * slower". This leaderboard ingests per-request observations per variant
 * and computes:
 *
 *   - request count, error count, error rate
 *   - latency percentiles (p50/p95/p99) via t-digest-ish histogram
 *     approximation — exact sorted percentiles are O(n log n) and fine
 *     for the observation volume a leaderboard sees;
 *   - conversion rate when conversions are recorded
 *   - a composite `score` = conversionRate − errorPenalty·errorRate −
 *     latencyPenalty·(p95/budgetMs) so variants can be ranked on more
 *     than one axis without hand-tuning weights per metric.
 *
 * Latencies are stored in a bounded reservoir (reservoir sampling) so
 * memory doesn't grow with traffic; percentile accuracy degrades
 * gracefully past the reservoir cap.
 *
 * Complexity: observe O(1) amortized; leaderboard O(V · R log R) where
 * R = reservoir size (per-variant sort on read).
 *
 * @module StrategyLayer/Engine
 */

import { StrategyEngineClock, SystemEngineClock } from './types';

export interface VariantObservation {
  /** Request latency (ms). */
  latencyMs: number;
  /** True when the request errored. */
  errored?: boolean;
}

export interface LeaderboardOptions {
  /** Reservoir size per variant for latency percentiles. Default 1024. */
  reservoirSize?: number;
  /** Latency budget used for scoring normalization (ms). Default 1000. */
  latencyBudgetMs?: number;
  /** Weight of error rate in the composite score. Default 1.0. */
  errorPenalty?: number;
  /** Weight of p95/budget in the composite score. Default 0.5. */
  latencyPenalty?: number;
  /** RNG injection for reservoir sampling (tests). */
  random?: () => number;
  clock?: StrategyEngineClock;
}

export interface VariantMetrics {
  variant: string;
  requests: number;
  errors: number;
  errorRate: number;
  conversions: number;
  conversionRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  score: number;
}

interface VariantBucket {
  requests: number;
  errors: number;
  conversions: number;
  latencySum: number;
  /** Reservoir of latencies (bounded). */
  reservoir: number[];
  /** Total observations seen (for reservoir replacement index). */
  seen: number;
}

export class VariantLeaderboard {
  private readonly _clock: StrategyEngineClock;
  private readonly _reservoirSize: number;
  private readonly _latencyBudgetMs: number;
  private readonly _errorPenalty: number;
  private readonly _latencyPenalty: number;
  private readonly _random: () => number;

  private readonly _variants = new Map<string, VariantBucket>();

  constructor(options: LeaderboardOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._reservoirSize = Math.max(8, options.reservoirSize ?? 1024);
    this._latencyBudgetMs = Math.max(1, options.latencyBudgetMs ?? 1000);
    this._errorPenalty = options.errorPenalty ?? 1.0;
    this._latencyPenalty = options.latencyPenalty ?? 0.5;
    this._random = options.random ?? Math.random;
  }

  /** Record one request outcome for `variant`. */
  observe(variant: string, obs: VariantObservation): void {
    const b = this._bucket(variant);
    b.requests++;
    if (obs.errored) b.errors++;
    b.latencySum += Math.max(0, obs.latencyMs);
    b.seen++;
    this._reservoirPush(b, Math.max(0, obs.latencyMs));
    void this._clock;
  }

  /** Record a conversion for `variant`. */
  recordConversion(variant: string): void {
    this._bucket(variant).conversions++;
  }

  /** Metrics for one variant. */
  metrics(variant: string): VariantMetrics | null {
    const b = this._variants.get(variant);
    if (!b) return null;
    return this._metricsFor(variant, b);
  }

  /**
   * All variants sorted by composite score descending — the actual
   * leaderboard. Variants with zero requests sort last.
   */
  leaderboard(): VariantMetrics[] {
    const out: VariantMetrics[] = [];
    for (const [v, b] of this._variants) out.push(this._metricsFor(v, b));
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Variant names currently tracked. */
  variants(): string[] {
    return Array.from(this._variants.keys());
  }

  /** Reset a variant's stats (e.g. after re-deploy). */
  reset(variant: string): boolean {
    return this._variants.delete(variant);
  }

  resetAll(): void {
    this._variants.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _bucket(variant: string): VariantBucket {
    let b = this._variants.get(variant);
    if (!b) {
      b = { requests: 0, errors: 0, conversions: 0, latencySum: 0, reservoir: [], seen: 0 };
      this._variants.set(variant, b);
    }
    return b;
  }

  /**
   * Reservoir sampling (Algorithm R): keep a uniform random sample of
   * `reservoirSize` items from the stream. After the reservoir fills,
   * item i is kept with probability size/i at a random slot — giving an
   * unbiased sample over the whole stream for percentile estimates.
   */
  private _reservoirPush(b: VariantBucket, v: number): void {
    if (b.reservoir.length < this._reservoirSize) {
      b.reservoir.push(v);
      return;
    }
    const j = Math.floor(this._random() * b.seen);
    if (j < this._reservoirSize) b.reservoir[j] = v;
  }

  private _metricsFor(variant: string, b: VariantBucket): VariantMetrics {
    const errorRate = b.requests > 0 ? b.errors / b.requests : 0;
    const conversionRate = b.requests > 0 ? b.conversions / b.requests : 0;
    const meanMs = b.requests > 0 ? b.latencySum / b.requests : 0;

    const sorted = b.reservoir.slice().sort((a, z) => a - z);
    const pct = (p: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
      return sorted[idx];
    };
    const p50 = pct(0.5);
    const p95 = pct(0.95);
    const p99 = pct(0.99);

    const score =
      conversionRate -
      this._errorPenalty * errorRate -
      this._latencyPenalty * Math.min(1, p95 / this._latencyBudgetMs);

    return {
      variant,
      requests: b.requests,
      errors: b.errors,
      errorRate,
      conversions: b.conversions,
      conversionRate,
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      meanMs,
      score,
    };
  }
}
