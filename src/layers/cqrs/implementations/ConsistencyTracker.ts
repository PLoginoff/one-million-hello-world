/**
 * ConsistencyTracker — measure and reason about read-side lag.
 *
 * In a CQRS system, the write side commits events at position N, but a
 * given projection may only have applied up to position M < N. The
 * difference (N - M) is the "lag" — and it's the fundamental reason the
 * read side is *eventually* consistent.
 *
 * The tracker:
 *  - Records each denormalizer's last-applied position + wall-clock time.
 *  - Compares it to a write-side "head" position supplied by the event
 *    store / command dispatch.
 *  - Reports per-denormalizer lag in both positions and milliseconds.
 *  - Offers `waitFor(name, position, timeout)` — a polling primitive for
 *    tests and read-your-write consistency.
 *
 * The lag histogram is approximate: we keep a sliding window of the last
 * K samples, then derive p50/p95/p99 on demand. K is configurable.
 *
 * @module CqrsLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** A single lag measurement for one projection. */
export interface LagSample {
  readonly denormalizer: string;
  /** Write-side head position at measure time. */
  readonly head: number;
  /** Projection's last-applied position. */
  readonly applied: number;
  /** head - applied. */
  readonly lag: number;
  /** Time of measurement. */
  readonly at: number;
}

/** Aggregate lag statistics for one projection. */
export interface LagStats {
  readonly denormalizer: string;
  readonly samples: number;
  readonly currentLag: number;
  readonly currentLagMs: number;
  readonly maxLag: number;
  readonly meanLag: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  /** Rate of catch-up in events/sec (recent samples). */
  readonly catchupRatePerSec: number;
}

/** Health classification. */
export type LagHealth = 'healthy' | 'lagging' | 'stalled' | 'unknown';

// ----------------------------------------------------------------- tracker

export interface ConsistencyTrackerOptions {
  /** Max retained samples per projection. */
  readonly windowSize?: number;
  /** Lag threshold above which a projection is 'lagging'. */
  readonly laggingThreshold?: number;
  /** Lag threshold above which a projection is 'stalled' (or no progress for stalledMs). */
  readonly stalledThreshold?: number;
  /** Stall timeout in ms — no progress for this long = stalled. */
  readonly stalledMs?: number;
}

export class ConsistencyTracker {
  private readonly _opts: Required<ConsistencyTrackerOptions>;
  /** Latest applied position per denormalizer. */
  private readonly _applied = new Map<string, number>();
  /** Wall-clock of last observed progress per denormalizer. */
  private readonly _lastProgressAt = new Map<string, number>();
  /** Sliding window of lag samples. */
  private readonly _samples = new Map<string, LagSample[]>();
  /** Write-side head position (set by the producer). */
  private _head = 0;
  private _headAt = Date.now();

  constructor(options: ConsistencyTrackerOptions = {}) {
    this._opts = {
      windowSize: options.windowSize ?? 256,
      laggingThreshold: options.laggingThreshold ?? 10,
      stalledThreshold: options.stalledThreshold ?? 1_000,
      stalledMs: options.stalledMs ?? 30_000,
    };
  }

  /**
   * Advance the write-side head. Called by the event store / bus whenever
   * a new event is committed.
   */
  observeHead(position: number): void {
    if (position > this._head) {
      this._head = position;
      this._headAt = Date.now();
    }
  }

  /** Current head position. */
  head(): number {
    return this._head;
  }

  /**
   * Record that a denormalizer applied events up to `position`. The
   * tracker computes lag against the current head and pushes a sample
   * into the sliding window.
   */
  observeApplied(denormalizer: string, position: number): LagSample {
    const prev = this._applied.get(denormalizer) ?? 0;
    const now = Date.now();
    if (position > prev) {
      this._applied.set(denormalizer, position);
      this._lastProgressAt.set(denormalizer, now);
    }
    const applied = this._applied.get(denormalizer) ?? 0;
    const sample: LagSample = {
      denormalizer,
      head: this._head,
      applied,
      lag: Math.max(0, this._head - applied),
      at: now,
    };
    let window = this._samples.get(denormalizer);
    if (!window) {
      window = [];
      this._samples.set(denormalizer, window);
    }
    window.push(sample);
    if (window.length > this._opts.windowSize) {
      window.splice(0, window.length - this._opts.windowSize);
    }
    return sample;
  }

  /** Current lag for a denormalizer (positions). */
  lag(denormalizer: string): number {
    const applied = this._applied.get(denormalizer) ?? 0;
    return Math.max(0, this._head - applied);
  }

  /** Current lag in ms (time since write head advanced past applied). */
  lagMs(denormalizer: string): number {
    const applied = this._applied.get(denormalizer) ?? 0;
    if (applied >= this._head) return 0;
    return Date.now() - this._headAt;
  }

  /** Classify a denormalizer's health based on current lag + progress. */
  health(denormalizer: string): LagHealth {
    const applied = this._applied.get(denormalizer);
    if (applied === undefined) return 'unknown';
    const lag = this.lag(denormalizer);
    if (lag >= this._opts.stalledThreshold) return 'stalled';
    const lastProgress = this._lastProgressAt.get(denormalizer) ?? 0;
    if (lag > 0 && Date.now() - lastProgress > this._opts.stalledMs) return 'stalled';
    if (lag >= this._opts.laggingThreshold) return 'lagging';
    return 'healthy';
  }

  /** Aggregate stats over the sliding window. */
  stats(denormalizer: string): LagStats {
    const window = this._samples.get(denormalizer) ?? [];
    const applied = this._applied.get(denormalizer) ?? 0;
    const lags = window.map((s) => s.lag).sort((a, b) => a - b);
    const sum = lags.reduce((a, b) => a + b, 0);
    const quantile = (q: number): number => {
      if (lags.length === 0) return 0;
      const idx = Math.min(lags.length - 1, Math.floor(q * lags.length));
      return lags[idx] ?? 0;
    };

    // Catch-up rate: (applied increase) / (time window). Use first + last
    // samples — a linear approximation that's good enough for ops alerts.
    let rate = 0;
    if (window.length >= 2) {
      const first = window[0];
      const last = window[window.length - 1];
      if (first && last && last.at > first.at) {
        rate = ((last.applied - first.applied) / (last.at - first.at)) * 1000;
      }
    }

    return {
      denormalizer,
      samples: window.length,
      currentLag: this.lag(denormalizer),
      currentLagMs: this.lagMs(denormalizer),
      maxLag: lags.length > 0 ? (lags[lags.length - 1] ?? 0) : 0,
      meanLag: lags.length > 0 ? sum / lags.length : 0,
      p50: quantile(0.5),
      p95: quantile(0.95),
      p99: quantile(0.99),
      catchupRatePerSec: rate,
    };
  }

  /**
   * Wait until `denormalizer` has applied at least `position`, polling
   * every `intervalMs`. Resolves `true` on success, `false` on timeout.
   *
   * Implementation is a sleep-poll loop — trivially correct, and bounded
   * by the timeout. A fancier version could subscribe to denormalizer
   * progress events; polling is more portable.
   */
  async waitFor(
    denormalizer: string,
    position: number,
    options: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<boolean> {
    const timeout = options.timeoutMs ?? 10_000;
    const interval = options.intervalMs ?? 10;
    const deadline = Date.now() + timeout;
    while (Date.now() <= deadline) {
      if ((this._applied.get(denormalizer) ?? 0) >= position) return true;
      await new Promise((r) => setTimeout(r, interval));
    }
    return (this._applied.get(denormalizer) ?? 0) >= position;
  }

  /** Estimated time (ms) until lag reaches 0 based on catch-up rate. */
  estimatedCatchupMs(denormalizer: string): number {
    const s = this.stats(denormalizer);
    if (s.currentLag === 0) return 0;
    if (s.catchupRatePerSec <= 0) return Number.POSITIVE_INFINITY;
    return (s.currentLag / s.catchupRatePerSec) * 1000;
  }

  /** All tracked denormalizers. */
  tracked(): string[] {
    return [...this._applied.keys()];
  }

  /** Clear all state — used on restart or test setup. */
  reset(): void {
    this._applied.clear();
    this._lastProgressAt.clear();
    this._samples.clear();
    this._head = 0;
    this._headAt = Date.now();
  }
}
