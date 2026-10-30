/**
 * Service Level Aggregator — RED metrics computed from spans.
 *
 * Turns a corpus of spans into per-service Rate/Error/Duration numbers:
 *
 *   Rate      — root-server-span count per minute (entry points only,
 *               so nested internal spans don't inflate the number)
 *   Errors    — fraction of entry spans with status.code === 'ERROR'
 *   Duration  — P50/P90/P99 of entry-span wall-clock durations
 *
 * Durations go through a fixed-bound histogram (Prometheus-style
 * le-buckets) so quantiles are approximate but O(1) memory per service
 * — no reservoir needed.
 *
 * @module DistributedTracingLayer/Engine2
 */

import { SpanSnapshot } from '../engine/Span';

const SERVICE_ATTR = 'service.name';

/** Fixed latency bounds (ms) — tail-tuned for service calls. */
export const LATENCY_BOUNDS_MS: ReadonlyArray<number> = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000,
];

export interface ServiceRed {
  readonly service: string;
  /** Entry-span count (rate numerator). */
  readonly requests: number;
  readonly errors: number;
  readonly errorRate: number;
  readonly windowMs: number;
  readonly requestsPerMinute: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p99Ms: number;
}

interface Runtime {
  count: number;
  errors: number;
  /** le-bucket counts, +Inf bucket implicit at index length. */
  buckets: number[];
  firstMs?: number;
  lastMs?: number;
}

export class ServiceLevelAggregator {
  private readonly _services = new Map<string, Runtime>();

  /**
   * Fold one trace's spans in. Only spans with `kind === 'server'` and
   * either no parent or a parent in a *different* service count as
   * entry points — the request-boundary convention.
   */
  addTrace(spans: ReadonlyArray<SpanSnapshot>): void {
    const byId = new Map<string, SpanSnapshot>();
    for (const s of spans) byId.set(s.spanId, s);
    for (const s of spans) {
      const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
      const isEntry =
        s.kind === 'server' &&
        (!parent || serviceOf(parent) !== serviceOf(s));
      if (!isEntry) continue;
      const rt = this._rt(serviceOf(s));
      rt.count += 1;
      if (s.status.code === 'ERROR') rt.errors += 1;
      rt.buckets[bucketIndex(s.endTimeMs - s.startTimeMs)] += 1;
      rt.firstMs = rt.firstMs === undefined ? s.startTimeMs : Math.min(rt.firstMs, s.startTimeMs);
      rt.lastMs = rt.lastMs === undefined ? s.endTimeMs : Math.max(rt.lastMs, s.endTimeMs);
    }
  }

  /** RED summary for one service. */
  report(service: string): ServiceRed | undefined {
    const rt = this._services.get(service);
    if (!rt || rt.count === 0) return undefined;
    const windowMs = Math.max((rt.lastMs ?? 0) - (rt.firstMs ?? 0), 1);
    return {
      service,
      requests: rt.count,
      errors: rt.errors,
      errorRate: rt.errors / rt.count,
      windowMs,
      requestsPerMinute: (rt.count / windowMs) * 60_000,
      p50Ms: quantile(rt.buckets, rt.count, 0.5),
      p90Ms: quantile(rt.buckets, rt.count, 0.9),
      p99Ms: quantile(rt.buckets, rt.count, 0.99),
    };
  }

  /** All services with ≥1 request, sorted by request count desc. */
  reportAll(): ServiceRed[] {
    const out: ServiceRed[] = [];
    for (const svc of this._services.keys()) {
      const r = this.report(svc);
      if (r) out.push(r);
    }
    out.sort((a, b) => b.requests - a.requests);
    return out;
  }

  services(): string[] {
    return [...this._services.keys()];
  }

  private _rt(service: string): Runtime {
    let rt = this._services.get(service);
    if (!rt) {
      rt = { count: 0, errors: 0, buckets: new Array<number>(LATENCY_BOUNDS_MS.length + 1).fill(0) };
      this._services.set(service, rt);
    }
    return rt;
  }
}

function serviceOf(s: SpanSnapshot): string {
  const v = s.attributes[SERVICE_ATTR];
  return typeof v === 'string' && v.length > 0 ? v : 'unknown';
}

/** Bucket index for a duration: first bound ≥ duration, else +Inf. */
function bucketIndex(durationMs: number): number {
  for (let i = 0; i < LATENCY_BOUNDS_MS.length; i++) {
    if (durationMs <= LATENCY_BOUNDS_MS[i]) return i;
  }
  return LATENCY_BOUNDS_MS.length;
}

/**
 * Approximate quantile from le-buckets: find the bucket containing the
 * q-th cumulative count, linearly interpolate inside it.
 */
function quantile(buckets: ReadonlyArray<number>, total: number, q: number): number {
  if (total === 0) return 0;
  const target = q * total;
  let cum = 0;
  for (let i = 0; i < buckets.length; i++) {
    cum += buckets[i];
    if (cum >= target) {
      const lower = i === 0 ? 0 : LATENCY_BOUNDS_MS[i - 1];
      const upper = i < LATENCY_BOUNDS_MS.length ? LATENCY_BOUNDS_MS[i] : lower * 4;
      const inBucket = buckets[i];
      const rank = target - (cum - inBucket);
      const frac = inBucket === 0 ? 0 : rank / inBucket;
      return lower + frac * (upper - lower);
    }
  }
  return LATENCY_BOUNDS_MS[LATENCY_BOUNDS_MS.length - 1];
}
