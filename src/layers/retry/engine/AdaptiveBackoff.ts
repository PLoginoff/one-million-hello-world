/**
 * AdaptiveBackoff — learns per-operation base delay from success latency.
 *
 * Fixed `baseDelay` guesses are wrong in both directions: too small and
 * retries pound a slow backend; too large and recovered services sit
 * idle while clients sleep. This tracker keeps an exponentially-weighted
 * moving average of *successful* call latencies per operation key and
 * derives:
 *
 *   baseDelay[key] = clamp(k · EMA_latency[key], minMs, maxMs)
 *
 * Rationale: a sane retry delay is proportional to how long the
 * operation normally takes — retrying a 5ms lookup after 50ms is
 * pointless, but a 2s report-generation legitimately needs seconds of
 * backoff. The multiplier `k` (default 1.0) lets callers bias toward
 * generosity; latency measured on *successes only* so failures don't
 * poison the estimate.
 *
 * Additional inputs:
 *   - `congestionFactor` — a [0..1] signal callers can feed from
 *     server pressure (e.g. 429 rate); inflates the delay temporarily.
 *   - Keys idle longer than `staleKeyMs` are dropped — a cold key gets
 *     the default again rather than a fossil estimate.
 *
 * Delay for attempt n: `baseDelay · growth^n` with optional ±jitter.
 *
 * Complexity: observe O(1); delayFor O(1); memory O(#keys).
 *
 * @module RetryLayer/Engine
 */

import { RetryEngineClock, SystemEngineClock } from './types';

export interface AdaptiveBackoffOptions {
  /** EMA smoothing factor in (0,1]. Higher = reacts faster. Default 0.2. */
  alpha?: number;
  /** Multiplier applied to EMA latency to get base delay. Default 1.0. */
  factor?: number;
  /** Base delay used before any observation (ms). Default 100. */
  defaultBaseMs?: number;
  /** Clamps for the derived base delay. */
  minBaseMs?: number;
  maxBaseMs?: number;
  /** Per-attempt exponential growth. Default 2.0. */
  growth?: number;
  /** Cap on computed delay after growth (ms). Default 60s. */
  maxDelayMs?: number;
  /** Random jitter fraction in [0,1]; ±fraction of the delay. Default 0.2. */
  jitter?: number;
  /** Drop keys idle longer than this (ms). Default 10min. */
  staleKeyMs?: number;
  /** RNG injection for tests (defaults to Math.random). */
  random?: () => number;
  clock?: RetryEngineClock;
}

interface KeyStats {
  /** EMA of success latency; `null` until first observation. */
  emaMs: number | null;
  /** Congestion signal in [0,1]; decays each observation. */
  congestion: number;
  observations: number;
  lastSeenMs: number;
}

export class AdaptiveBackoff {
  private readonly _clock: RetryEngineClock;
  private readonly _alpha: number;
  private readonly _factor: number;
  private readonly _defaultBase: number;
  private readonly _minBase: number;
  private readonly _maxBase: number;
  private readonly _growth: number;
  private readonly _maxDelay: number;
  private readonly _jitter: number;
  private readonly _staleKeyMs: number;
  private readonly _random: () => number;

  private readonly _keys = new Map<string, KeyStats>();

  constructor(options: AdaptiveBackoffOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._alpha = options.alpha ?? 0.2;
    this._factor = options.factor ?? 1.0;
    this._defaultBase = Math.max(0, options.defaultBaseMs ?? 100);
    this._minBase = Math.max(0, options.minBaseMs ?? 10);
    this._maxBase = Math.max(this._minBase, options.maxBaseMs ?? 5_000);
    this._growth = Math.max(1, options.growth ?? 2.0);
    this._maxDelay = Math.max(0, options.maxDelayMs ?? 60_000);
    this._jitter = Math.max(0, Math.min(1, options.jitter ?? 0.2));
    this._staleKeyMs = Math.max(0, options.staleKeyMs ?? 600_000);
    this._random = options.random ?? Math.random;
    if (this._alpha <= 0 || this._alpha > 1) {
      throw new Error('AdaptiveBackoff: alpha must be in (0,1]');
    }
  }

  /**
   * Record a successful call's latency. The EMA folds it in; congestion
   * decays by half (congestion is transient by assumption).
   */
  observeSuccess(key: string, latencyMs: number): void {
    const s = this._stats(key);
    s.emaMs = s.emaMs === null ? latencyMs : this._alpha * latencyMs + (1 - this._alpha) * s.emaMs;
    s.congestion *= 0.5;
    s.observations++;
    s.lastSeenMs = this._clock.now();
  }

  /**
   * Record a congestion hint (0..1, e.g. share of recent 429s).
   * Inflates subsequent delays for this key.
   */
  observeCongestion(key: string, factor: number): void {
    const s = this._stats(key);
    s.congestion = Math.max(0, Math.min(1, factor));
    s.lastSeenMs = this._clock.now();
  }

  /**
   * Delay for attempt `attempt` (0-based: the delay *before* that
   * retry). Applies growth and jitter.
   */
  delayFor(key: string, attempt: number): number {
    const s = this._stats(key);
    const base = this._baseFor(s);
    const grown = base * Math.pow(this._growth, Math.max(0, attempt));
    const congested = grown * (1 + s.congestion);
    const capped = Math.min(this._maxDelay, congested);
    if (this._jitter === 0) return Math.round(capped);
    const span = capped * this._jitter;
    const offset = (this._random() * 2 - 1) * span;
    return Math.max(0, Math.round(capped + offset));
  }

  /** Current learned base delay for `key` (pre-growth, pre-jitter). */
  baseDelayFor(key: string): number {
    return this._baseFor(this._stats(key));
  }

  /** Drop keys idle past `staleKeyMs`. Returns removed count. */
  sweepStale(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [k, s] of this._keys) {
      if (now - s.lastSeenMs > this._staleKeyMs) {
        this._keys.delete(k);
        removed++;
      }
    }
    return removed;
  }

  /** Forget one key's learned latency (next call uses the default). */
  reset(key: string): boolean {
    return this._keys.delete(key);
  }

  snapshot(): ReadonlyArray<{ key: string; emaMs: number | null; baseDelayMs: number; congestion: number; observations: number }> {
    const out: Array<{ key: string; emaMs: number | null; baseDelayMs: number; congestion: number; observations: number }> = [];
    for (const [key, s] of this._keys) {
      out.push({ key, emaMs: s.emaMs, baseDelayMs: this._baseFor(s), congestion: s.congestion, observations: s.observations });
    }
    return out;
  }

  private _baseFor(s: KeyStats): number {
    const raw = s.emaMs === null ? this._defaultBase : s.emaMs * this._factor;
    return Math.min(this._maxBase, Math.max(this._minBase, raw));
  }

  private _stats(key: string): KeyStats {
    let s = this._keys.get(key);
    if (!s) {
      s = { emaMs: null, congestion: 0, observations: 0, lastSeenMs: this._clock.now() };
      this._keys.set(key, s);
    }
    return s;
  }
}
