/**
 * LoadEngine — discrete-event load-test simulator
 *
 * Drives virtual users through a {@link LoadSchedule} on a virtual clock,
 * invoking the scenario handler per request and recording latency,
 * throughput, and errors. The engine is event-driven:
 *
 *   - a spawn controller ticks at fixed intervals, adjusting the live
 *     VU pool toward schedule.activeUsers(t);
 *   - each ready VU issues a request; the scenario returns a latency,
 *     and completion is pushed onto a min-heap keyed by completion time;
 *   - the clock always advances to the nearest pending event, so a
 *     2-hour soak test simulates in O(events) real work — typically
 *     milliseconds.
 *
 * Determinism: PRNG and all "clocks" are injected/virtual.
 *
 * Thresholds are k6-style assertions evaluated both live (abortOnBreach
 * for early exit) and once at the end for the final report.
 *
 * @module PerformanceTesting/Engine
 */

import {
  LatencySnapshot,
  ReservoirSampler,
  SlidingThroughputWindow,
  ErrorRateTracker,
  ErrorClass,
  mulberry32,
} from './Metrics';
import {
  LoadSchedule,
  VirtualUser,
  ThinkTime,
  ConstantThinkTime,
  Scenario,
  pickScenario,
} from './LoadModel';

/* ------------------------------------------------------------------------ */
/* Thresholds                                                               */
/* ------------------------------------------------------------------------ */

export type ThresholdOp = '<' | '<=' | '>' | '>=' | '==' | '!=';

/** Metric a threshold can bind to. */
export type ThresholdMetric =
  | 'latency.p50'
  | 'latency.p90'
  | 'latency.p95'
  | 'latency.p99'
  | 'latency.mean'
  | 'latency.max'
  | 'errors.rate'
  | 'errors.count'
  | 'throughput.rps'
  | 'requests.count';

export interface Threshold {
  readonly metric: ThresholdMetric;
  readonly op: ThresholdOp;
  readonly value: number;
  /** When true, a breach aborts the run immediately. */
  readonly abortOnBreach?: boolean;
}

export interface ThresholdResult {
  readonly threshold: Threshold;
  readonly ok: boolean;
  readonly observed: number;
}

function compareOp(observed: number, op: ThresholdOp, value: number): boolean {
  switch (op) {
    case '<': return observed < value;
    case '<=': return observed <= value;
    case '>': return observed > value;
    case '>=': return observed >= value;
    case '==': return observed === value;
    case '!=': return observed !== value;
  }
}

/* ------------------------------------------------------------------------ */
/* Run results                                                              */
/* ------------------------------------------------------------------------ */

export interface RequestSample {
  readonly at: number;
  readonly vuId: number;
  readonly scenario: string;
  readonly latencyMs: number;
  readonly ok: boolean;
  readonly error?: string;
  readonly errorClass?: ErrorClass;
}

export interface TimelinePoint {
  readonly at: number;
  readonly activeUsers: number;
  readonly requests: number;
  readonly errors: number;
  readonly p50: number;
  readonly p95: number;
}

export interface LoadTestReport {
  readonly durationMs: number;
  readonly totalRequests: number;
  readonly totalErrors: number;
  /** End-of-test latency distribution estimate. */
  readonly latency: LatencySnapshot;
  /** Peak requests/sec over any sliding window. */
  readonly peakThroughput: number;
  /** Average requests/sec over the whole run. */
  readonly avgThroughput: number;
  readonly errorRate: number;
  readonly errorsByClass: ReadonlyMap<ErrorClass, number>;
  readonly thresholdResults: readonly ThresholdResult[];
  /** True when every threshold held and the run wasn't aborted. */
  readonly passed: boolean;
  readonly aborted: boolean;
  readonly abortReason?: string;
  /** Per-bucket time series for spike/soak analysis. */
  readonly timeline: readonly TimelinePoint[];
  /** Raw latency samples in completion order (for baseline diffs). */
  readonly samples: readonly number[];
  readonly recentErrors: readonly { at: number; klass: ErrorClass; message?: string }[];
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                   */
/* ------------------------------------------------------------------------ */

export interface LoadEngineOptions {
  readonly schedule: LoadSchedule;
  readonly scenarios: readonly Scenario[];
  readonly thinkTime?: ThinkTime;
  readonly thresholds?: readonly Threshold[];
  readonly seed?: number;
  /** reservoir capacity for percentile estimation (default 2048) */
  readonly reservoirSize?: number;
  /** timeline bucket width in ms (default 1000) */
  readonly timelineBucketMs?: number;
  /** sliding window for throughput/error-rate (default 10000) */
  readonly windowMs?: number;
  /** spawn controller tick in ms (default 100) */
  readonly tickMs?: number;
  /** optional request-level sample cap for the raw `samples` array */
  readonly maxSamples?: number;
}

/** Pending request completion. */
interface PendingRequest {
  readonly completeAt: number;
  readonly vuId: number;
  readonly scenario: string;
  readonly latency: number;
  readonly ok: boolean;
  readonly error?: string;
  readonly errorClass?: ErrorClass;
}

/** Binary min-heap over `completeAt`. O(log n) push/pop. */
class CompletionHeap {
  private readonly _items: PendingRequest[] = [];

  get size(): number {
    return this._items.length;
  }

  peek(): PendingRequest | undefined {
    return this._items[0];
  }

  push(item: PendingRequest): void {
    this._items.push(item);
    let i = this._items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._items[p].completeAt <= this._items[i].completeAt) break;
      const tmp = this._items[p];
      this._items[p] = this._items[i];
      this._items[i] = tmp;
      i = p;
    }
  }

  pop(): PendingRequest | undefined {
    if (this._items.length === 0) return undefined;
    const top = this._items[0];
    const last = this._items.pop()!;
    if (this._items.length > 0) {
      this._items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this._items.length && this._items[l].completeAt < this._items[m].completeAt) m = l;
        if (r < this._items.length && this._items[r].completeAt < this._items[m].completeAt) m = r;
        if (m === i) break;
        const tmp = this._items[m];
        this._items[m] = this._items[i];
        this._items[i] = tmp;
        i = m;
      }
    }
    return top;
  }
}

/**
 * Discrete-event load-test engine.
 *
 * ```ts
 * const report = await new LoadEngine({
 *   schedule: LoadSchedule.ramp(50, 10_000, 60_000, 10_000),
 *   scenarios: [{ name: 'read', weight: 1, execute: () => 40 + rand() * 20 }],
 *   thresholds: [{ metric: 'latency.p99', op: '<', value: 500 }],
 * }).run();
 * ```
 */
export class LoadEngine {
  private readonly _rand: () => number;

  constructor(private readonly _options: LoadEngineOptions) {
    this._rand = mulberry32(_options.seed ?? 0xc0ffee);
  }

  /** Execute the simulation to completion or threshold abort. */
  async run(): Promise<LoadTestReport> {
    const o = this._options;
    const think = o.thinkTime ?? new ConstantThinkTime(0);
    const schedule = o.schedule;
    const tickMs = o.tickMs ?? 100;
    const bucketMs = o.timelineBucketMs ?? 1_000;
    const maxSamples = o.maxSamples ?? 100_000;
    const seed = o.seed ?? 1;

    let now = 0;
    const virtualNow = (): number => now;

    const reservoir = new ReservoirSampler(o.reservoirSize ?? 2048, seed * 31 + 7);
    const bucketLat = new ReservoirSampler(256, seed + 5);
    const throughput = new SlidingThroughputWindow(o.windowMs ?? 10_000, 60, virtualNow);
    const errors = new ErrorRateTracker(o.windowMs ?? 10_000, virtualNow);
    const samples: number[] = [];

    const vus = new Map<number, VirtualUser>();
    let nextVuId = 0;
    const heap = new CompletionHeap();

    const timeline: TimelinePoint[] = [];
    let bucketReq = 0;
    let bucketErr = 0;
    let nextBucketAt = bucketMs;
    let peakRps = 0;
    let aborted = false;
    let abortReason: string | undefined;

    const flushBucket = (): void => {
      timeline.push({
        at: nextBucketAt,
        activeUsers: Math.round(schedule.activeUsers(nextBucketAt)),
        requests: bucketReq,
        errors: bucketErr,
        p50: bucketLat.percentile(50),
        p95: bucketLat.percentile(95),
      });
      bucketReq = 0;
      bucketErr = 0;
      nextBucketAt += bucketMs;
    };

    const liveCheck = (): string | undefined => {
      for (const t of o.thresholds ?? []) {
        if (!t.abortOnBreach) continue;
        const observed = this._metricValue(t.metric, {
          lat: reservoir.snapshot(),
          errors,
          throughput,
          totalRequests: reservoir.seen,
        });
        if (!Number.isNaN(observed) && !compareOp(observed, t.op, t.value)) {
          return `threshold breached: ${t.metric} ${t.op} ${t.value} (observed ${observed.toFixed(3)})`;
        }
      }
      return undefined;
    };

    const spawn = (): VirtualUser => {
      const vu = new VirtualUser(
        nextVuId,
        think,
        mulberry32(seed * 7919 + nextVuId * 104729)
      );
      nextVuId++;
      vus.set(vu.id, vu);
      return vu;
    };

    const retire = (): void => {
      for (const [id, vu] of [...vus.entries()].reverse()) {
        if (vu.state !== 'waiting') {
          vu.finish();
          vus.delete(id);
          return;
        }
      }
    };

    /** Issue a request for a ready VU; returns pending completion. */
    const issue = async (vu: VirtualUser): Promise<void> => {
      const scenario = pickScenario(o.scenarios, this._rand);
      vu.startRequest(now);
      let latency = 0;
      let ok = true;
      let errMsg: string | undefined;
      let errClass: ErrorClass | undefined;
      try {
        latency = await scenario.execute(vu, now);
        if (!Number.isFinite(latency) || latency < 0) {
          ok = false;
          errMsg = `invalid latency ${latency}`;
          errClass = 'other';
          latency = 0;
        }
      } catch (e) {
        ok = false;
        errMsg = e instanceof Error ? e.message : String(e);
        errClass = e instanceof ScenarioTimeout ? 'timeout' : 'other';
        latency = o.windowMs ?? 10_000;
      }
      heap.push({
        completeAt: now + Math.max(0, latency),
        vuId: vu.id,
        scenario: scenario.name,
        latency,
        ok,
        error: errMsg,
        errorClass: errClass,
      });
    };

    const totalMs = schedule.totalMs;

    while (now < totalMs || heap.size > 0) {
      const nextTick = now < totalMs ? Math.floor(now / tickMs) * tickMs + tickMs : Infinity;
      const nextCompletion = heap.peek()?.completeAt ?? Infinity;
      const advanceTo = Math.min(nextTick, nextCompletion, totalMs > now ? totalMs : nextCompletion);

      // process all completions due at/before advanceTo
      while (heap.size > 0 && heap.peek()!.completeAt <= advanceTo) {
        const ev = heap.pop()!;
        now = Math.max(now, ev.completeAt);
        const vu = vus.get(ev.vuId);
        if (vu) vu.complete(now);
        reservoir.record(ev.latency);
        bucketLat.record(ev.latency);
        bucketReq++;
        throughput.record(1);
        if (ev.ok) {
          errors.recordSuccess();
        } else {
          errors.recordError(ev.errorClass ?? 'other', ev.error);
          bucketErr++;
        }
        if (samples.length < maxSamples) samples.push(ev.latency);
        peakRps = Math.max(peakRps, throughput.perSecond());
      }

      // timeline buckets elapsed
      while (nextBucketAt <= now) flushBucket();

      // schedule finished and queue drained → done
      if (now >= totalMs && heap.size === 0) break;

      now = Math.max(now, advanceTo === Infinity ? now : advanceTo);
      if (now > totalMs && heap.size === 0) break;

      // spawn/retire toward desired level (only while schedule runs)
      if (now < totalMs) {
        const desired = schedule.activeUsers(now);
        while (vus.size < Math.floor(desired)) spawn();
        const frac = desired - Math.floor(desired);
        if (frac > 0 && vus.size < Math.ceil(desired) && this._rand() < frac) spawn();
        while (vus.size > Math.ceil(desired)) {
          const before = vus.size;
          retire();
          if (vus.size === before) break;
        }

        // issue requests for all ready VUs
        for (const vu of vus.values()) {
          if (vu.ready(now)) {
            await issue(vu);
          }
        }
      }

      const breach = liveCheck();
      if (breach) {
        aborted = true;
        abortReason = breach;
        break;
      }

      // safety: if nothing can advance the clock, bail
      if (heap.size === 0 && nextTick === Infinity) break;
      if (heap.size === 0 && now >= totalMs) break;
    }

    while (nextBucketAt <= now + bucketMs) {
      flushBucket();
      if (timeline.length > totalMs / bucketMs + 4) break;
    }

    const lat = reservoir.snapshot();
    const thresholdResults: ThresholdResult[] = (o.thresholds ?? []).map((t) => {
      const observed = this._metricValue(t.metric, {
        lat,
        errors,
        throughput,
        totalRequests: reservoir.seen,
      });
      return { threshold: t, ok: compareOp(observed, t.op, t.value), observed };
    });

    return {
      durationMs: now,
      totalRequests: reservoir.seen,
      totalErrors: errors.totalErrors,
      latency: lat,
      peakThroughput: peakRps,
      avgThroughput: reservoir.seen / Math.max(1, now / 1000),
      errorRate: errors.rate(),
      errorsByClass: errors.byClass(),
      thresholdResults,
      passed: thresholdResults.every((r) => r.ok) && !aborted,
      aborted,
      abortReason,
      timeline,
      samples,
      recentErrors: errors.recentErrors(),
    };
  }

  private _metricValue(
    metric: ThresholdMetric,
    ctx: {
      lat: LatencySnapshot;
      errors: ErrorRateTracker;
      throughput: SlidingThroughputWindow;
      totalRequests: number;
    }
  ): number {
    switch (metric) {
      case 'latency.p50': return ctx.lat.p50;
      case 'latency.p90': return ctx.lat.p90;
      case 'latency.p95': return ctx.lat.p95;
      case 'latency.p99': return ctx.lat.p99;
      case 'latency.mean': return ctx.lat.mean;
      case 'latency.max': return ctx.lat.max;
      case 'errors.rate': return ctx.errors.rate();
      case 'errors.count': return ctx.errors.totalErrors;
      case 'throughput.rps': return ctx.throughput.perSecond();
      case 'requests.count': return ctx.totalRequests;
    }
  }
}

/** Marker error a scenario may throw to signal a client-side timeout. */
export class ScenarioTimeout extends Error {
  constructor(message = 'scenario timed out') {
    super(message);
    this.name = 'ScenarioTimeout';
  }
}

/** Convenience wrapper for synchronous scenario handlers. */
export async function simulateLoad(options: LoadEngineOptions): Promise<LoadTestReport> {
  return new LoadEngine(options).run();
}
