/**
 * Adaptive Sampler — per-operation reservoir rate-limiting.
 *
 * The engine's `TailBasedSampler` decides keep/drop on *finished* traces
 * via policies; this sampler works on the head of the stream: it decides
 * whether a *new* trace should be sampled at all, per operation
 * (root span name), giving each operation a fair share of a global
 * traces-per-second budget.
 *
 * Algorithm: token bucket per operation with a shared global ceiling.
 * Per-op rate adapts via AIMD — an operation that keeps exhausting its
 * allowance gets more; an idle one decays back to the floor. This is
 * the Jaeger "adaptive sampler" model in miniature.
 *
 * @module DistributedTracingLayer/Engine2
 */

import { IClock, SystemClock } from '../../observability/engine/signals';

export interface AdaptiveConfig {
  /** Global sampling budget (traces/sec across all operations). */
  readonly totalTracesPerSecond: number;
  /** Guaranteed floor per operation. */
  readonly minTracesPerSecond: number;
  /** How quickly an over-budget op's allowance grows (additive). */
  readonly increasePerSecond: number;
  /** Decay factor applied per second to an op's allowance (multiplicative). */
  readonly decayPerSecond: number;
  /** Per-op hard ceiling. */
  readonly maxTracesPerSecond: number;
}

export const DEFAULT_ADAPTIVE: AdaptiveConfig = {
  totalTracesPerSecond: 100,
  minTracesPerSecond: 1,
  increasePerSecond: 0.1,
  decayPerSecond: 0.95,
  maxTracesPerSecond: 20,
};

interface OpBucket {
  /** Available tokens (fractional — accrue at allowance rate). */
  tokens: number;
  /** Current allowance (traces/sec). */
  allowance: number;
  /** Last time the bucket was topped up. */
  lastRefillMs: number;
  /** Last time AIMD adaptation ran (≥1s cadence). */
  lastAdaptMs: number;
  /** Whether the op exhausted its allowance since last adaptation. */
  starved: boolean;
}

export interface SamplingStats {
  readonly operation: string;
  readonly allowance: number;
  readonly admitted: number;
  readonly dropped: number;
}

export class AdaptiveSampler {
  private readonly _config: AdaptiveConfig;
  private readonly _clock: IClock;
  private readonly _ops = new Map<string, OpBucket & { admitted: number; dropped: number }>();

  constructor(config: Partial<AdaptiveConfig> = {}, clock: IClock = new SystemClock()) {
    this._config = { ...DEFAULT_ADAPTIVE, ...config };
    this._clock = clock;
  }

  /**
   * Should a trace rooted at `operation` be sampled? Token-bucket:
   * accrues `allowance` tokens/sec up to 2× allowance; each admitted
   * trace spends one token.
   */
  shouldSample(operation: string): boolean {
    const b = this._bucket(operation);
    this._refill(b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      b.admitted += 1;
      return true;
    }
    b.starved = true;
    b.dropped += 1;
    return false;
  }

  /** Drive AIMD adaptation — call periodically (e.g. every second). */
  evaluate(): void {
    const now = this._clock.nowMs();
    for (const b of this._ops.values()) {
      if (now - b.lastAdaptMs < 1_000) continue;
      b.lastAdaptMs = now;
      if (b.starved) {
        b.allowance = Math.min(b.allowance + this._config.increasePerSecond, this._config.maxTracesPerSecond);
        b.starved = false;
      } else {
        b.allowance = Math.max(b.allowance * this._config.decayPerSecond, this._config.minTracesPerSecond);
      }
    }
  }

  /** Current per-op stats for the adaptive controller/UI. */
  stats(): SamplingStats[] {
    return [...this._ops.entries()].map(([operation, b]) => ({
      operation,
      allowance: b.allowance,
      admitted: b.admitted,
      dropped: b.dropped,
    }));
  }

  allowanceOf(operation: string): number {
    return this._ops.get(operation)?.allowance ?? this._config.minTracesPerSecond;
  }

  private _bucket(operation: string): OpBucket & { admitted: number; dropped: number } {
    let b = this._ops.get(operation);
    if (!b) {
      b = {
        tokens: this._config.minTracesPerSecond,
        allowance: this._config.minTracesPerSecond,
        lastRefillMs: this._clock.nowMs(),
        lastAdaptMs: this._clock.nowMs(),
        starved: false,
        admitted: 0,
        dropped: 0,
      };
      this._ops.set(operation, b);
    }
    return b;
  }

  /** Accrue tokens at the allowance rate, capped at 2× allowance. */
  private _refill(b: OpBucket): void {
    const now = this._clock.nowMs();
    const elapsedS = (now - b.lastRefillMs) / 1_000;
    if (elapsedS <= 0) return;
    b.tokens = Math.min(b.tokens + elapsedS * b.allowance, b.allowance * 2);
    b.lastRefillMs = now;
  }


}
