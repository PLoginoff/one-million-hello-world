/**
 * LatencyHistogram — bounded reservoir of write-latency samples with
 * percentile queries.
 *
 * Implementation: fixed-capacity circular buffer of float64 samples
 * (O(1) insert, O(n) memory for n ≤ capacity). Percentiles are computed
 * on demand over a sorted copy — O(n log n) — which is the right
 * tradeoff here: writes are hot, percentile queries are cold.
 * For truly high-frequency percentile queries a t-digest or HDR
 * histogram would be warranted; documented as a follow-up.
 *
 * @module TransportLayer/Engine
 */

import { LatencySnapshot } from './types';

export class LatencyHistogram {
  private readonly _samples: Float64Array;
  private _head: number;
  private _count: number;

  constructor(capacity: number = 4096) {
    this._samples = new Float64Array(Math.max(1, capacity));
    this._head = 0;
    this._count = 0;
  }

  record(latencyMs: number): void {
    this._samples[this._head] = latencyMs;
    this._head = (this._head + 1) % this._samples.length;
    this._count = Math.min(this._count + 1, this._samples.length);
  }

  get count(): number {
    return this._count;
  }

  /**
   * Nearest-rank percentile. p ∈ [0,100]. Returns 0 when empty.
   */
  percentile(p: number): number {
    if (this._count === 0) {
      return 0;
    }
    const view = Array.from(this._samples.subarray(0, this._count));
    view.sort((a, b) => a - b);
    const idx = Math.min(
      view.length - 1,
      Math.max(0, Math.ceil((p / 100) * view.length) - 1)
    );
    return view[idx] as number;
  }

  snapshot(): LatencySnapshot {
    if (this._count === 0) {
      return { count: 0, min: 0, max: 0, p50: 0, p90: 0, p99: 0 };
    }
    const view = Array.from(this._samples.subarray(0, this._count));
    view.sort((a, b) => a - b);
    const pick = (p: number): number => {
      const idx = Math.min(
        view.length - 1,
        Math.max(0, Math.ceil((p / 100) * view.length) - 1)
      );
      return view[idx] as number;
    };
    return {
      count: this._count,
      min: view[0] as number,
      max: view[view.length - 1] as number,
      p50: pick(50),
      p90: pick(90),
      p99: pick(99),
    };
  }

  reset(): void {
    this._head = 0;
    this._count = 0;
  }
}
