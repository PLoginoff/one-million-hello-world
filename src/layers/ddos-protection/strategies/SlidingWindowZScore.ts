/**
 * SlidingWindowZScore — request-rate anomaly detection
 *
 * Maintains a sliding window of per-bucket request counts per source IP.
 * Each window of length W is split into `bucketCount` buckets; the detector
 * keeps a history of past window totals to build a baseline distribution
 * (mean μ, std σ), then computes:
 *
 *     z = (currentRate - μ) / σ
 *
 * A z-score > `zThreshold` flags an anomaly. Works for:
 *  - HTTP flood (per-IP request rate)
 *  - UDP/ICMP floods (per-source packet rate)
 *  - "slow-and-low" anomalies when tuned with large windows
 *
 * Numerical notes:
 *  - Mean/variance via Welford's online algorithm (numerically stable).
 *  - σ < 1e-6 is clamped to avoid division blowups on near-constant traffic.
 *  - When history is too short (< minHistory), detector is permissive.
 *
 * O(1) amortized per event (bucketed); O(history) per z-score.
 *
 * @module DdosProtectionLayer/Strategies
 */

import { DetectionResult, IDetector, TrafficEvent, allow, verdict } from '../types/traffic';

export interface SlidingWindowZScoreConfig {
  /** Bucket width in ms. Default 1000 (1-second buckets). */
  bucketMs?: number;
  /** Buckets retained per source. Default 60 (1 minute). */
  bucketCount?: number;
  /** Z-score above which we flag. Default 3.5. */
  zThreshold?: number;
  /** Minimum history windows before z-score is meaningful. Default 5. */
  minHistory?: number;
  /** Verdict to emit on anomaly. Default 'rate-limit'. */
  verdict?: 'rate-limit' | 'block' | 'challenge';
}

interface SourceWindow {
  /** Circular buffer of per-bucket counts. */
  buckets: number[];
  /** Index of the bucket covering `windowStart`. */
  headBucket: number;
  /** Timestamp at the start of `buckets[headBucket]`. */
  windowStart: number;
  /** Welford state over *window totals* (rate per full window). */
  n: number;
  mean: number;
  m2: number;
}

export class SlidingWindowZScore implements IDetector {
  readonly name = 'sliding-window-zscore';

  private readonly _bucketMs: number;
  private readonly _bucketCount: number;
  private readonly _zThreshold: number;
  private readonly _minHistory: number;
  private readonly _verdict: 'rate-limit' | 'block' | 'challenge';
  private readonly _sources: Map<string, SourceWindow>;

  constructor(config: SlidingWindowZScoreConfig = {}) {
    this._bucketMs = config.bucketMs ?? 1000;
    this._bucketCount = config.bucketCount ?? 60;
    this._zThreshold = config.zThreshold ?? 3.5;
    this._minHistory = config.minHistory ?? 5;
    this._verdict = config.verdict ?? 'rate-limit';
    this._sources = new Map();
  }

  inspect(event: TrafficEvent): DetectionResult {
    const w = this._windowFor(event.srcIp, event.at);
    this._incrementCurrent(w, event.at);
    const current = this._currentRate(w);
    const z = this._zScore(w, current);

    if (z === null) {
      return allow(['insufficient-history']);
    }
    if (z > this._zThreshold) {
      return verdict(this._verdict, Math.min(1, z / (this._zThreshold * 3)), [
        `z-score:${z.toFixed(2)}>${this._zThreshold}`,
        `rate:${current.toFixed(2)} events/${this._bucketMs}ms`,
        `baseline:${w.mean.toFixed(2)}`,
      ], { z, rate: current, mean: w.mean, stddev: Math.sqrt(w.m2 / w.n) });
    }
    return allow([`z:${z.toFixed(2)}`]);
  }

  /** Force the baseline update for a source (call between epochs in tests). */
  closeWindow(srcIp: string): void {
    const w = this._sources.get(srcIp);
    if (!w) {
      return;
    }
    const total = w.buckets.reduce((s, v) => s + v, 0);
    this._updateWelford(w, total);
    w.buckets.fill(0);
  }

  reset(): void {
    this._sources.clear();
  }

  /** Snapshot of a source's baseline stats (for tests/diagnostics). */
  baseline(srcIp: string): { n: number; mean: number; stddev: number } | undefined {
    const w = this._sources.get(srcIp);
    if (!w) {
      return undefined;
    }
    return { n: w.n, mean: w.mean, stddev: w.n > 1 ? Math.sqrt(w.m2 / (w.n - 1)) : 0 };
  }

  // -------------------------------------------------------------------------

  private _windowFor(srcIp: string, now: number): SourceWindow {
    let w = this._sources.get(srcIp);
    if (!w) {
      w = {
        buckets: new Array(this._bucketCount).fill(0),
        headBucket: 0,
        windowStart: now,
        n: 0,
        mean: 0,
        m2: 0,
      };
      this._sources.set(srcIp, w);
    }
    return w;
  }

  /**
   * Increment the appropriate bucket for `now`; if the window has rolled,
   * fold the completed window into the baseline and shift.
   */
  private _incrementCurrent(w: SourceWindow, now: number): void {
    const windowMs = this._bucketMs * this._bucketCount;
    if (now - w.windowStart >= windowMs) {
      // Window rolled: fold the last full window into the baseline, then reset.
      const total = w.buckets.reduce((s, v) => s + v, 0);
      this._updateWelford(w, total);
      w.buckets.fill(0);
      w.headBucket = 0;
      // Advance windowStart by whole windows.
      const windows = Math.floor((now - w.windowStart) / windowMs);
      w.windowStart += windows * windowMs;
    }
    const offset = Math.floor((now - w.windowStart) / this._bucketMs);
    const idx = (w.headBucket + offset) % this._bucketCount;
    w.buckets[idx] += 1;
  }

  private _currentRate(w: SourceWindow): number {
    // Count the current window's events so far.
    return w.buckets.reduce((s, v) => s + v, 0);
  }

  /** Welford online update for the window-total baseline. */
  private _updateWelford(w: SourceWindow, x: number): void {
    w.n += 1;
    const delta = x - w.mean;
    w.mean += delta / w.n;
    const delta2 = x - w.mean;
    w.m2 += delta * delta2;
  }

  /**
   * z-score of `x` against the baseline. Returns null when history is too
   * short to be trustworthy.
   */
  private _zScore(w: SourceWindow, x: number): number | null {
    if (w.n < this._minHistory) {
      return null;
    }
    const variance = w.m2 / Math.max(1, w.n - 1);
    const stddev = Math.sqrt(variance);
    if (stddev < 1e-6) {
      // Degenerate: any deviation from a constant baseline is infinite.
      return x === w.mean ? 0 : (x > w.mean ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    }
    return (x - w.mean) / stddev;
  }
}
