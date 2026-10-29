/**
 * Metrics Engine
 *
 * In-process metric aggregation: counters, gauges, histograms and
 * summaries grouped by name + attribute-set. Mirrors the OpenTelemetry
 * metrics data model:
 *
 *   instrument.record(name, value, attrs) → accumulator → collect()
 *     → MetricDataPoint[] ready for export
 *
 * Histograms use explicit bounds (le-buckets) like Prometheus; summaries
 * keep a bounded reservoir of recent values for approximate quantiles
 * (P50/P90/P99) without storing every observation.
 *
 * @module ObservabilityLayer/Engine
 */

import {
  AggregationTemporality,
  AttributeValue,
  Attributes,
  IClock,
  MetricDataPoint,
  MetricKind,
  SystemClock,
} from './signals';

/** Stable attribute key for grouping — sorted k=v pairs. */
export function attributeKey(attrs: Attributes | undefined): string {
  if (!attrs) return '';
  return Object.keys(attrs)
    .sort()
    .map((k) => `${k}=${String(attrs[k])}`)
    .join(',');
}

interface AccumBase {
  name: string;
  kind: MetricKind;
  attributes: Attributes;
  startMs: number;
}

interface CounterAcc extends AccumBase {
  kind: 'counter';
  value: number;
}

interface GaugeAcc extends AccumBase {
  kind: 'gauge';
  value: number;
}

interface HistogramAcc extends AccumBase {
  kind: 'histogram';
  bounds: number[];
  buckets: number[];
  count: number;
  sum: number;
  min: number;
  max: number;
}

interface SummaryAcc extends AccumBase {
  kind: 'summary';
  reservoir: number[];
  reservoirCap: number;
  count: number;
  sum: number;
}

type Accumulator = CounterAcc | GaugeAcc | HistogramAcc | SummaryAcc;

export interface MetricsEngineConfig {
  /** Default histogram bucket boundaries. */
  readonly defaultHistogramBounds?: ReadonlyArray<number>;
  /** Reservoir cap for summaries (power-of-2 friendly). */
  readonly summaryReservoirSize?: number;
  readonly temporality?: AggregationTemporality;
}

const DEFAULT_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

/**
 * Accumulates measurements and produces export snapshots.
 * `collect()` drains in 'delta' mode (accumulators reset) or snapshots
 * in 'cumulative' mode.
 */
export class MetricsEngine {
  private readonly _accs = new Map<string, Accumulator>();
  private readonly _clock: IClock;
  private readonly _bounds: number[];
  private readonly _reservoirCap: number;
  private readonly _temporality: AggregationTemporality;

  constructor(config: MetricsEngineConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._bounds = [...(config.defaultHistogramBounds ?? DEFAULT_BOUNDS)].sort((a, b) => a - b);
    this._reservoirCap = config.summaryReservoirSize ?? 1024;
    this._temporality = config.temporality ?? 'cumulative';
  }

  /** Increment a counter. Negative values are clamped to 0 adds. */
  increment(name: string, by = 1, attributes?: Attributes): void {
    const key = `counter|${name}|${attributeKey(attributes)}`;
    let a = this._accs.get(key) as CounterAcc | undefined;
    if (!a) {
      a = { name, kind: 'counter', attributes: attributes ?? {}, startMs: this._clock.nowMs(), value: 0 };
      this._accs.set(key, a);
    }
    a.value += Math.max(0, by);
  }

  /** Set a gauge to an absolute value. */
  set(name: string, value: number, attributes?: Attributes): void {
    const key = `gauge|${name}|${attributeKey(attributes)}`;
    let a = this._accs.get(key) as GaugeAcc | undefined;
    if (!a) {
      a = { name, kind: 'gauge', attributes: attributes ?? {}, startMs: this._clock.nowMs(), value };
      this._accs.set(key, a);
      return;
    }
    a.value = value;
  }

  /** Observe a histogram sample (e.g. request duration). */
  observe(name: string, value: number, attributes?: Attributes, bounds?: ReadonlyArray<number>): void {
    const key = `histogram|${name}|${attributeKey(attributes)}`;
    let a = this._accs.get(key) as HistogramAcc | undefined;
    if (!a) {
      const b = [...(bounds ?? this._bounds)].sort((x, y) => x - y);
      a = {
        name, kind: 'histogram', attributes: attributes ?? {},
        startMs: this._clock.nowMs(), bounds: b, buckets: new Array(b.length + 1).fill(0),
        count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY,
      };
      this._accs.set(key, a);
    }
    a.count++;
    a.sum += value;
    if (value < a.min) a.min = value;
    if (value > a.max) a.max = value;
    // Bucket index = first bound >= value; le-buckets.
    let idx = a.bounds.length;
    for (let i = 0; i < a.bounds.length; i++) {
      if (value <= a.bounds[i]) {
        idx = i;
        break;
      }
    }
    a.buckets[idx]++;
  }

  /** Record a summary sample (bounded reservoir for quantiles). */
  record(name: string, value: number, attributes?: Attributes): void {
    const key = `summary|${name}|${attributeKey(attributes)}`;
    let a = this._accs.get(key) as SummaryAcc | undefined;
    if (!a) {
      a = {
        name, kind: 'summary', attributes: attributes ?? {},
        startMs: this._clock.nowMs(), reservoir: [], reservoirCap: this._reservoirCap,
        count: 0, sum: 0,
      };
      this._accs.set(key, a);
    }
    a.count++;
    a.sum += value;
    if (a.reservoir.length < a.reservoirCap) {
      a.reservoir.push(value);
    } else {
      // Vitter-style random replacement: keeps a uniform sample.
      const j = Math.floor(Math.random() * a.count);
      if (j < a.reservoirCap) a.reservoir[j] = value;
    }
  }

  /**
   * Quantile estimate for a summary, 0..1 (e.g. 0.99). Returns undefined
   * if the reservoir is empty.
   */
  quantile(name: string, q: number, attributes?: Attributes): number | undefined {
    const a = this._accs.get(`summary|${name}|${attributeKey(attributes)}`) as SummaryAcc | undefined;
    if (!a || a.reservoir.length === 0) return undefined;
    const sorted = [...a.reservoir].sort((x, y) => x - y);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
    return sorted[idx];
  }

  /**
   * Drain or snapshot all accumulators into export data points.
   * 'delta' mode resets accumulators after collection.
   */
  collect(): MetricDataPoint[] {
    const out: MetricDataPoint[] = [];
    for (const [key, a] of this._accs) {
      out.push(this._toDataPoint(a));
      if (this._temporality === 'delta' && a.kind !== 'gauge') {
        this._accs.delete(key);
      }
    }
    return out;
  }

  private _toDataPoint(a: Accumulator): MetricDataPoint {
    switch (a.kind) {
      case 'counter':
      case 'gauge':
        return {
          name: a.name, kind: a.kind, value: a.value,
          temporality: a.kind === 'gauge' ? 'cumulative' : this._temporality,
        };
      case 'histogram': {
        // Convert per-bucket counts to cumulative le-counts.
        const cum: Array<{ le: number; count: number }> = [];
        let acc = 0;
        for (let i = 0; i < a.bounds.length; i++) {
          acc += a.buckets[i];
          cum.push({ le: a.bounds[i], count: acc });
        }
        acc += a.buckets[a.bounds.length];
        cum.push({ le: Number.POSITIVE_INFINITY, count: acc });
        return {
          name: a.name, kind: 'histogram', value: a.sum / Math.max(1, a.count),
          temporality: this._temporality,
          buckets: cum, count: a.count, sum: a.sum, min: a.min, max: a.max,
        };
      }
      case 'summary':
        return {
          name: a.name, kind: 'summary', value: a.sum / Math.max(1, a.count),
          temporality: this._temporality, count: a.count, sum: a.sum,
        };
    }
  }

  /** Names of all metric series currently held. */
  series(): string[] {
    return [...this._accs.keys()];
  }

  reset(): void {
    this._accs.clear();
  }
}

/** Attribute coercion helper — instrumentation points often hand us `unknown`. */
export function toAttributes(obj: Record<string, unknown>): Attributes {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
      out[k] = v as AttributeValue[];
    }
  }
  return out;
}
