/**
 * TimingEntropySignal — behavioral fingerprinting via inter-request timing
 *
 * Humans produce *noisy* inter-request gaps (typing, reading, network jitter);
 * bots typically emit perfectly regular intervals or negligible jitter.
 * The signal measures the coefficient of variation (σ/μ) of the last N
 * inter-arrival gaps per IP:
 *
 *   - CV < 0.05 (very regular)     → bot-looking
 *   - CV < 0.15 with ≥10 samples   → suspicious
 *   - Otherwise                    → human-looking
 *
 * A tiny random jitter (~ms) is what real browsers naturally have; perfectly
 * periodic traffic is a strong tell.
 *
 * O(1) per event; bounded history per IP.
 *
 * @module BotDetectionLayer/Strategies
 */

import { BotSignalInput, IBotSignal, SignalResult } from '../types/request';

export interface TimingConfig {
  /** How many recent gaps to keep per IP. Default 20. */
  history?: number;
  /** Minimum samples needed before scoring. Default 5. */
  minSamples?: number;
  /** CV below this with ≥minSamples → high-confidence bot. Default 0.05. */
  veryRegularCv?: number;
  /** CV below this → suspicious. Default 0.15. */
  suspiciousCv?: number;
}

interface IpHistory {
  gaps: number[];
  lastAt: number;
}

export class TimingEntropySignal implements IBotSignal {
  readonly name = 'timing-entropy';
  readonly weight = 2;

  private readonly _history: number;
  private readonly _minSamples: number;
  private readonly _veryRegularCv: number;
  private readonly _suspiciousCv: number;
  private readonly _byIp: Map<string, IpHistory>;

  constructor(config: TimingConfig = {}) {
    this._history = config.history ?? 20;
    this._minSamples = config.minSamples ?? 5;
    this._veryRegularCv = config.veryRegularCv ?? 0.05;
    this._suspiciousCv = config.suspiciousCv ?? 0.15;
    this._byIp = new Map();
  }

  evaluate(input: BotSignalInput): SignalResult {
    const h = this._hist(input.clientIp);
    if (h.lastAt > 0) {
      const gap = Math.max(0, input.at - h.lastAt);
      h.gaps.push(gap);
      if (h.gaps.length > this._history) {
        h.gaps.shift();
      }
    }
    h.lastAt = input.at;

    if (h.gaps.length < this._minSamples) {
      return {
        signal: this.name,
        score: 0,
        confidence: 0.3,
        reason: `insufficient-samples:${h.gaps.length}`,
      };
    }

    const { mean, stddev, cv } = stats(h.gaps);
    if (cv < this._veryRegularCv) {
      return {
        signal: this.name,
        score: 0.95,
        confidence: 0.9,
        reason: `cv:${cv.toFixed(3)}<${this._veryRegularCv} (robotic)`,
      };
    }
    if (cv < this._suspiciousCv) {
      return {
        signal: this.name,
        score: 0.6,
        confidence: 0.75,
        reason: `cv:${cv.toFixed(3)} (regular)`,
      };
    }
    return {
      signal: this.name,
      score: 0,
      confidence: 0.8,
      reason: `cv:${cv.toFixed(3)} (human-like)`,
    };
  }

  /** Stats helper exposed for tests. */
  gapsFor(ip: string): readonly number[] {
    return this._byIp.get(ip)?.gaps ?? [];
  }

  private _hist(ip: string): IpHistory {
    let h = this._byIp.get(ip);
    if (!h) {
      h = { gaps: [], lastAt: 0 };
      this._byIp.set(ip, h);
    }
    return h;
  }
}

/** Basic stats: mean, population stddev, coefficient of variation. */
export function stats(values: readonly number[]): { mean: number; stddev: number; cv: number } {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, cv: 0 };
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  const stddev = Math.sqrt(variance);
  const cv = mean === 0 ? (stddev === 0 ? 0 : Number.POSITIVE_INFINITY) : stddev / mean;
  return { mean, stddev, cv };
}
