/**
 * InboxMetrics — latency percentiles and throughput for the inbox engine.
 *
 * The engine's `ConsumerStats` gives counters; operators need
 * DISTRIBUTIONS: p50/p95/p99 processing latency, end-to-end lag
 * (receivedAt → processedAt), messages/sec over sliding windows.
 *
 * Implementation:
 *   - Reservoir sampling per consumer: a bounded reservoir (default
 *     1024) holds recent latency samples uniformly at random — O(1) per
 *     record, no unbounded growth.
 *   - Percentiles computed by sorting the reservoir snapshot — O(k log k)
 *     on query, where k = reservoir size (small and bounded).
 *   - Throughput via a sliding-window rate tracker: events counted in
 *     fixed buckets; rate = sum(window)/windowMs.
 *
 * Latency sources recorded:
 *   - 'process': handler execution time (acquire → complete)
 *   - 'e2e':     end-to-end lag (receivedAt → processedAt)
 *   - 'retry':   time spent in FAILED before retry
 *
 * @module Inbox/Engine2
 */

import type { InboxRecord } from '../pattern/types';
import { InboxState } from '../pattern/types';

// ------------------------------------------------------------------ reservoir

/**
 * Fixed-size reservoir (Algorithm R): keeps a uniform-random sample of
 * a stream of unknown length. The RNG is injectable for deterministic
 * tests.
 */
export class Reservoir {
  private readonly _capacity: number;
  private readonly _samples: number[] = [];
  private _seen = 0;
  private readonly _rng: () => number;

  constructor(capacity = 1024, rng: () => number = Math.random) {
    this._capacity = capacity;
    this._rng = rng;
  }

  /** Observe a value — O(1). */
  add(v: number): void {
    this._seen++;
    if (this._samples.length < this._capacity) {
      this._samples.push(v);
      return;
    }
    // Reservoir sampling: replace slot j with probability capacity/seen.
    const j = Math.floor(this._rng() * this._seen);
    if (j < this._capacity) this._samples[j] = v;
  }

  /** Snapshot, sorted ascending. */
  sorted(): number[] {
    return [...this._samples].sort((a, b) => a - b);
  }

  get size(): number {
    return this._samples.length;
  }

  get seen(): number {
    return this._seen;
  }
}

// ------------------------------------------------------------------ percentiles

/** Percentile summary. */
export interface LatencySummary {
  readonly count: number;
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly mean: number;
}

/** Percentiles from a sorted sample array (nearest-rank). */
export function summarize(sorted: readonly number[]): LatencySummary {
  const n = sorted.length;
  if (n === 0) {
    return { count: 0, min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  }
  const pct = (p: number): number => sorted[Math.min(n - 1, Math.ceil((p / 100) * n) - 1)]!;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return { count: n, min: sorted[0]!, p50: pct(50), p90: pct(90), p95: pct(95), p99: pct(99), max: sorted[n - 1]!, mean };
}

// ------------------------------------------------------------------ rate window

/**
 * Sliding-window event-rate tracker: counts events in `bucketCount`
 * fixed buckets spanning `windowMs`; rate = events / elapsed window.
 */
export class RateTracker {
  private readonly _buckets: number[];
  private readonly _bucketMs: number;
  private readonly _windowMs: number;
  private _cursor = -1;
  private readonly _now: () => number;

  constructor(windowMs = 60_000, bucketCount = 60, now: () => number = Date.now) {
    this._windowMs = windowMs;
    this._bucketMs = windowMs / bucketCount;
    this._buckets = new Array(bucketCount).fill(0);
    this._now = now;
  }

  private _bucket(t: number): number {
    return Math.floor(t / this._bucketMs) % this._buckets.length;
  }

  private _roll(now: number): void {
    const slot = Math.floor(now / this._bucketMs);
    if (this._cursor === -1) {
      this._cursor = slot;
      return;
    }
    // Clear buckets we've skipped past (bounded by window).
    const span = Math.min(this._buckets.length, slot - this._cursor);
    for (let i = 1; i <= span; i++) {
      this._buckets[(this._cursor + i) % this._buckets.length] = 0;
    }
    this._cursor = slot;
  }

  /** Record an event at `at` (defaults to now). */
  record(at?: number): void {
    const t = at ?? this._now();
    this._roll(t);
    this._buckets[this._bucket(t)]!++;
  }

  /** Events in the last `windowMs` (defaults to the full window). */
  rate(windowMs?: number): number {
    const now = this._now();
    this._roll(now);
    const w = windowMs ?? this._windowMs;
    const need = Math.ceil(w / this._bucketMs);
    let sum = 0;
    for (let i = 0; i < need; i++) {
      const idx = (this._cursor - i + this._buckets.length * 2) % this._buckets.length;
      sum += this._buckets[idx]!;
    }
    return sum / (w / 1000);
  }
}

// ------------------------------------------------------------------ metrics

/** Which latency dimension a sample belongs to. */
export type LatencyKind = 'process' | 'e2e' | 'retry';

/** Per-consumer metrics bundle. */
interface ConsumerMetrics {
  reservoirs: Record<LatencyKind, Reservoir>;
  processedRate: RateTracker;
  receivedRate: RateTracker;
  failedRate: RateTracker;
}

/** Snapshot of one consumer's metrics. */
export interface InboxMetricsSnapshot {
  readonly consumer: string;
  readonly process: LatencySummary;
  readonly e2e: LatencySummary;
  readonly retry: LatencySummary;
  /** Events/sec over the tracker's window. */
  readonly processedPerSec: number;
  readonly receivedPerSec: number;
  readonly failedPerSec: number;
}

export class InboxMetricsCollector {
  private readonly _metrics = new Map<string, ConsumerMetrics>();
  private readonly _reservoirSize: number;
  private readonly _windowMs: number;
  private readonly _now: () => number;
  private readonly _rng: () => number;

  constructor(options: { reservoirSize?: number; windowMs?: number } = {}, now: () => number = Date.now, rng: () => number = Math.random) {
    this._reservoirSize = options.reservoirSize ?? 1024;
    this._windowMs = options.windowMs ?? 60_000;
    this._now = now;
    this._rng = rng;
  }

  private _for(consumer: string): ConsumerMetrics {
    let m = this._metrics.get(consumer);
    if (!m) {
      m = {
        reservoirs: {
          process: new Reservoir(this._reservoirSize, this._rng),
          e2e: new Reservoir(this._reservoirSize, this._rng),
          retry: new Reservoir(this._reservoirSize, this._rng),
        },
        processedRate: new RateTracker(this._windowMs, 60, this._now),
        receivedRate: new RateTracker(this._windowMs, 60, this._now),
        failedRate: new RateTracker(this._windowMs, 60, this._now),
      };
      this._metrics.set(consumer, m);
    }
    return m;
  }

  /** Record a received message. */
  onReceived(consumer: string): void {
    this._for(consumer).receivedRate.record();
  }

  /**
   * Record a completed processing cycle. `record` is the inbox record;
   * `handlerMs` is the measured handler runtime.
   */
  onProcessed(record: InboxRecord, handlerMs: number): void {
    const m = this._for(record.consumer);
    m.processedRate.record();
    m.reservoirs.process.add(handlerMs);
    if (record.processedAt !== undefined) {
      m.reservoirs.e2e.add(record.processedAt - record.receivedAt);
    }
    if (record.attempts > 1 && record.processedAt !== undefined && record.receivedAt !== undefined) {
      m.reservoirs.retry.add(record.processedAt - record.receivedAt);
    }
  }

  /** Record a failed attempt. */
  onFailed(record: InboxRecord): void {
    this._for(record.consumer).failedRate.record();
  }

  /** Snapshot a consumer's metrics. */
  snapshot(consumer: string): InboxMetricsSnapshot {
    const m = this._for(consumer);
    return {
      consumer,
      process: summarize(m.reservoirs.process.sorted()),
      e2e: summarize(m.reservoirs.e2e.sorted()),
      retry: summarize(m.reservoirs.retry.sorted()),
      processedPerSec: m.processedRate.rate(),
      receivedPerSec: m.receivedRate.rate(),
      failedPerSec: m.failedRate.rate(),
    };
  }

  /** Consumers being tracked. */
  consumers(): string[] {
    return [...this._metrics.keys()];
  }
}
