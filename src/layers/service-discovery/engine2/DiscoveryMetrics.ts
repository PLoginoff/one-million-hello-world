/**
 * DiscoveryMetrics — lookup latency, hit rate, and per-source counters.
 *
 * Records every discovery lookup with its latency and outcome:
 *  - hit rate = fresh-cache hits / total lookups
 *  - latency percentiles over a bounded reservoir (same reservoir
 *    sampling as load-balancer metrics — O(1) record, bounded memory)
 *  - per-source counters (local, dns, each cluster) for fan-in analysis
 *
 * @module ServiceDiscoveryLayer/Engine2
 */

import { LookupResult, SdClock2, SystemSdClock2 } from './types';

export interface DiscoveryMetricsOptions {
  /** Latency reservoir capacity. Default 1024. */
  reservoirSize?: number;
  rng?: () => number;
  clock?: SdClock2;
}

export interface DiscoveryStats {
  readonly lookups: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly empty: number;
  readonly errors: number;
  readonly latency: {
    readonly count: number;
    readonly meanMs: number;
    readonly p50Ms: number;
    readonly p95Ms: number;
    readonly p99Ms: number;
    readonly maxMs: number;
  };
  readonly bySource: Readonly<Record<string, number>>;
}

export class DiscoveryMetrics {
  private readonly _reservoirSize: number;
  private readonly _rng: () => number;
  private readonly _clock: SdClock2;
  private _lookups = 0;
  private _hits = 0;
  private _empty = 0;
  private _errors = 0;
  private _reservoir: number[] = [];
  private _samplesSeen = 0;
  private readonly _bySource = new Map<string, number>();

  constructor(opts: DiscoveryMetricsOptions = {}) {
    this._reservoirSize = Math.max(16, opts.reservoirSize ?? 1024);
    this._rng = opts.rng ?? Math.random;
    this._clock = opts.clock ?? new SystemSdClock2();
  }

  /** Record one completed lookup. */
  record(result: LookupResult): void {
    this._lookups++;
    if (result.cached) this._hits++;
    if (result.instances.length === 0) this._empty++;
    this._bySource.set(result.source, (this._bySource.get(result.source) ?? 0) + 1);
    this._offer(result.latencyMs);
  }

  /** Record a failed lookup (transport threw). */
  recordError(source: string, latencyMs: number): void {
    this._lookups++;
    this._errors++;
    this._bySource.set(source, (this._bySource.get(source) ?? 0) + 1);
    this._offer(latencyMs);
  }

  stats(): DiscoveryStats {
    const n = this._reservoir.length;
    const sorted = n > 0 ? [...this._reservoir].sort((a, b) => a - b) : [];
    const rank = (p: number): number =>
      n === 0 ? 0 : sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
    let sum = 0;
    for (const v of sorted) sum += v;
    const bySource: Record<string, number> = {};
    for (const [k, v] of this._bySource) bySource[k] = v;
    return {
      lookups: this._lookups,
      hits: this._hits,
      misses: this._lookups - this._hits,
      hitRate: this._lookups === 0 ? 0 : this._hits / this._lookups,
      empty: this._empty,
      errors: this._errors,
      latency: {
        count: n,
        meanMs: n === 0 ? 0 : sum / n,
        p50Ms: rank(0.5),
        p95Ms: rank(0.95),
        p99Ms: rank(0.99),
        maxMs: n === 0 ? 0 : sorted[n - 1],
      },
      bySource,
    };
  }

  reset(): void {
    this._lookups = 0;
    this._hits = 0;
    this._empty = 0;
    this._errors = 0;
    this._reservoir = [];
    this._samplesSeen = 0;
    this._bySource.clear();
  }

  /** Time an async lookup and record it — thin instrumentation helper. */
  async time<T extends Omit<LookupResult, 'latencyMs'>>(
    source: string,
    fn: () => Promise<T>
  ): Promise<T & { latencyMs: number }> {
    const start = this._clock.now();
    try {
      const partial = await fn();
      const full = { ...partial, latencyMs: this._clock.now() - start };
      this.record(full);
      return full;
    } catch (err) {
      this.recordError(source, this._clock.now() - start);
      throw err;
    }
  }

  /* ---------------------------------------------------------------- */

  private _offer(ms: number): void {
    this._samplesSeen++;
    if (this._reservoir.length < this._reservoirSize) {
      this._reservoir.push(ms);
      return;
    }
    const slot = Math.floor(this._rng() * this._samplesSeen);
    if (slot < this._reservoirSize) this._reservoir[slot] = ms;
  }
}
