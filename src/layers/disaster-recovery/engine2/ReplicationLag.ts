/**
 * Replication Lag Tracker
 *
 * The RPO's raw input: how far behind the replica is *right now* and
 * whether that is inside or outside the declared bound. Lag comes in
 * two currencies — time (ms behind primary's last write) and bytes
 * (WAL/txn backlog); this tracker records both and answers:
 *
 *   - `current()` — the instant lag read (what measure() feeds).
 *   - `window()` — a sliding-window aggregate: avg/max/p95 over the
 *     retained samples, so "what was our steady-state RPO over the
 *     last hour" is a number, not an impression.
 *   - `breach()` — the longest continuous stretch above the target
 *     inside the window; a lag that spikes 30s and recovers is a
 *     different conversation than one that sits over the RPO for
 *     twenty minutes.
 *
 * Samples are (at, lagMs, lagBytes); eviction drops the expired prefix.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

import { DrClock2, SystemDrClock2 } from './types';

export interface LagSample2 {
  readonly at: number;
  readonly lagMs: number;
  readonly lagBytes: number;
}

export interface LagWindow {
  readonly samples: number;
  readonly avgLagMs: number;
  readonly maxLagMs: number;
  readonly p95LagMs: number;
  readonly avgLagBytes: number;
  /** Longest run of samples above `targetMs`, in ms. */
  readonly longestBreachMs: number;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i] ?? 0;
}

export class ReplicationLagTracker {
  private readonly _clock: DrClock2;
  private readonly _windowMs: number;
  private readonly _samples: LagSample2[] = [];

  constructor(windowMs: number, clock: DrClock2 = new SystemDrClock2()) {
    if (windowMs <= 0) throw new Error('windowMs must be positive');
    this._windowMs = windowMs;
    this._clock = clock;
  }

  /** Record a lag sample at `at` (default now). */
  record(lagMs: number, lagBytes = 0, at?: number): void {
    this._samples.push({ at: at ?? this._clock.now(), lagMs, lagBytes });
    this._evict();
  }

  /** The most recent lag sample; null when none recorded. */
  current(): LagSample2 | null {
    const s = this._samples[this._samples.length - 1];
    return s ?? null;
  }

  /** Aggregates over the trailing window. */
  window(targetMs = 0): LagWindow {
    this._evict();
    const samples = this._samples;
    const lags = samples.map((s) => s.lagMs).sort((a, b) => a - b);
    const avg = samples.length ? lags.reduce((a, b) => a + b, 0) / samples.length : 0;
    const avgB = samples.length
      ? samples.reduce((n, s) => n + s.lagBytes, 0) / samples.length
      : 0;
    // Longest continuous above-target run: walk timestamps; a breach is
    // the span between consecutive above-target samples.
    let longest = 0;
    let breachStart: number | null = null;
    for (const s of samples) {
      if (s.lagMs > targetMs) {
        if (breachStart === null) breachStart = s.at;
        longest = Math.max(longest, s.at - breachStart);
      } else {
        breachStart = null;
      }
    }
    return {
      samples: samples.length,
      avgLagMs: avg,
      maxLagMs: lags.length ? lags[lags.length - 1] ?? 0 : 0,
      p95LagMs: percentile(lags, 95),
      avgLagBytes: avgB,
      longestBreachMs: longest,
    };
  }

  private _evict(): void {
    const cutoff = this._clock.now() - this._windowMs;
    let drop = 0;
    while (drop < this._samples.length) {
      const s = this._samples[drop];
      if (s === undefined || s.at >= cutoff) break;
      drop++;
    }
    if (drop > 0) this._samples.splice(0, drop);
  }
}
