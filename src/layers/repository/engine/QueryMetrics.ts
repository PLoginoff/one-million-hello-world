/**
 * Query Metrics Collector
 *
 * Per-query-label latency metrics with percentile estimation. The layer's
 * existing `RepositoryMetricsCollector` tracks counts/averages; this engine
 * adds distribution metrics — the thing averages hide (a p99 of 2s under a
 * 3ms average is invisible without a histogram).
 *
 * Two backends:
 *  - `ReservoirSampler` per label: fixed-capacity Vitter-style reservoir
 *    giving an unbiased sample of all observed latencies; percentiles read
 *    from a sorted copy. O(cap) memory regardless of query count.
 *  - Exact mode (`unbounded: true`): stores every sample — correct for
 *    tests/small workloads.
 *
 * Recorded labels are caller-chosen strings (`findById`, `search`, …).
 *
 * @module RepositoryLayer/Engine
 */

export interface PercentileSnapshot {
  readonly label: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export interface QueryMetricsOptions {
  /** Reservoir capacity per label (default 1024). */
  readonly reservoirSize?: number;
  /** Keep every sample instead of reservoir sampling. */
  readonly unbounded?: boolean;
  /** Injectable RNG for reservoir replacement (tests: seeded determinism). */
  readonly rand?: () => number;
}

/**
 * Fixed-capacity reservoir implementing "Algorithm R" (Vitter 1985):
 * the first `cap` items fill the reservoir; item n > cap replaces a
 * uniformly-chosen slot with probability cap/n. Every observed value has
 * equal probability of surviving — an unbiased random sample.
 */
class Reservoir {
  private values: number[] = [];
  private seen = 0;
  constructor(
    private readonly cap: number,
    private readonly rand: () => number,
    private readonly unbounded: boolean
  ) {}

  add(v: number): void {
    this.seen++;
    if (this.unbounded || this.values.length < this.cap) {
      this.values.push(v);
      return;
    }
    const j = Math.floor(this.rand() * this.seen);
    if (j < this.cap) this.values[j] = v;
  }

  get size(): number {
    return this.seen;
  }

  snapshot(): number[] {
    return this.values.slice().sort((a, b) => a - b);
  }
}

export class QueryMetrics {
  private readonly reservoirs = new Map<string, Reservoir>();
  private readonly cap: number;
  private readonly rand: () => number;
  private readonly unbounded: boolean;
  private readonly errors = new Map<string, number>();

  constructor(options: QueryMetricsOptions = {}) {
    this.cap = options.reservoirSize ?? 1024;
    this.rand = options.rand ?? Math.random;
    this.unbounded = options.unbounded ?? false;
  }

  /** Records one query execution. */
  record(label: string, durationMs: number): void {
    let r = this.reservoirs.get(label);
    if (!r) {
      r = new Reservoir(this.cap, this.rand, this.unbounded);
      this.reservoirs.set(label, r);
    }
    r.add(durationMs);
  }

  /** Times `fn` and records under `label`. Re-throws, recording the error. */
  measure<R>(label: string, fn: () => R, clock: () => number = Date.now): R {
    const t0 = clock();
    try {
      return fn();
    } catch (e) {
      this.errors.set(label, (this.errors.get(label) ?? 0) + 1);
      throw e;
    } finally {
      this.record(label, clock() - t0);
    }
  }

  recordError(label: string): void {
    this.errors.set(label, (this.errors.get(label) ?? 0) + 1);
  }

  errorsFor(label: string): number {
    return this.errors.get(label) ?? 0;
  }

  /**
   * Percentile snapshot for one label.
   * Percentile method: nearest-rank on the sorted sample — deterministic,
   * matches Prometheus `histogram_quantile` intuition closely enough for
   * in-process observability.
   */
  snapshot(label: string): PercentileSnapshot | null {
    const r = this.reservoirs.get(label);
    if (!r || r.size === 0) return null;
    const sorted = r.snapshot();
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      label,
      count: r.size,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / r.size,
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    };
  }

  /** Snapshots for every observed label. */
  snapshotAll(): PercentileSnapshot[] {
    return [...this.reservoirs.keys()]
      .map((l) => this.snapshot(l))
      .filter((s): s is PercentileSnapshot => s !== null);
  }

  /** Approx Prometheus-style exposition for a label. */
  renderPrometheus(label: string): string {
    const s = this.snapshot(label);
    if (!s) return '';
    const lines = [
      `# TYPE repository_query_duration_ms summary`,
      `repository_query_duration_ms{label="${label}",quantile="0.5"} ${s.p50}`,
      `repository_query_duration_ms{label="${label}",quantile="0.9"} ${s.p90}`,
      `repository_query_duration_ms{label="${label}",quantile="0.95"} ${s.p95}`,
      `repository_query_duration_ms{label="${label}",quantile="0.99"} ${s.p99}`,
      `repository_query_duration_ms_sum{label="${label}"} ${s.mean * s.count}`,
      `repository_query_duration_ms_count{label="${label}"} ${s.count}`,
    ];
    return lines.join('\n');
  }

  reset(label?: string): void {
    if (label === undefined) {
      this.reservoirs.clear();
      this.errors.clear();
    } else {
      this.reservoirs.delete(label);
      this.errors.delete(label);
    }
  }
}

/** Nearest-rank percentile on an already-sorted array. */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}
