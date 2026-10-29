/**
 * Sampling Strategies
 *
 * Head-based and tail-based sampling for telemetry signals.
 *
 * Head-based sampling decides at ingest time, before a trace is complete —
 * it uses a deterministic hash of the trace id so all spans of one trace
 * are kept or dropped consistently ("consistent probability sampling").
 *
 * Tail-based sampling buffers a whole trace until the root span (or a
 * configurable grace window) arrives, then evaluates policies:
 *   - always sample when any span has ERROR status
 *   - always sample when latency (root span duration) exceeds a threshold
 *   - otherwise apply a baseline probability
 *
 * @module ObservabilityLayer/Engine
 */

import { IClock, SpanSignal, SystemClock } from './signals';

/** Common decision surface for all samplers. */
export interface ISampler {
  readonly name: string;
  shouldSample(traceId: string, context?: SamplingContext): boolean;
}

export interface SamplingContext {
  readonly span?: SpanSignal;
  readonly traceSpans?: ReadonlyArray<SpanSignal>;
}

/**
 * FNV-1a 32-bit hash — fast, deterministic across processes (unlike
 * `String.prototype.hashCode` equivalents that rely on runtime seeds).
 * Used to map a trace id uniformly into [0, 1).
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Multiply by FNV prime using shifts to avoid float rounding:
    // h = h * 16777619 mod 2^32
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Map a hex trace id into a uniform [0,1) fraction. */
export function traceIdToFraction(traceId: string): number {
  return fnv1a32(traceId) / 0x100000000;
}

/**
 * Head-based consistent probability sampler. The same trace id always
 * yields the same decision, so every downstream span of a sampled trace
 * is kept regardless of which service made the decision.
 */
export class HeadBasedSampler implements ISampler {
  readonly name = 'head-based';
  private _ratio: number;

  constructor(ratio: number) {
    if (ratio < 0 || ratio > 1) {
      throw new RangeError(`sampling ratio must be in [0,1], got ${ratio}`);
    }
    this._ratio = ratio;
  }

  get ratio(): number {
    return this._ratio;
  }

  setRatio(ratio: number): void {
    if (ratio < 0 || ratio > 1) throw new RangeError('ratio must be in [0,1]');
    this._ratio = ratio;
  }

  shouldSample(traceId: string): boolean {
    if (this._ratio >= 1) return true;
    if (this._ratio <= 0) return false;
    return traceIdToFraction(traceId) < this._ratio;
  }
}

/** Rate-limited sampler: at most N traces per rolling second, then falls back to a base ratio. */
export class RateLimitingSampler implements ISampler {
  readonly name = 'rate-limiting';
  private readonly _maxPerSecond: number;
  private readonly _fallback: HeadBasedSampler;
  private readonly _clock: IClock;
  private _windowStartMs: number;
  private _used: number;

  constructor(maxPerSecond: number, fallbackRatio = 0, clock: IClock = new SystemClock()) {
    this._maxPerSecond = Math.max(0, maxPerSecond);
    this._fallback = new HeadBasedSampler(fallbackRatio);
    this._clock = clock;
    this._windowStartMs = clock.nowMs();
    this._used = 0;
  }

  shouldSample(traceId: string): boolean {
    const now = this._clock.nowMs();
    if (now - this._windowStartMs >= 1000) {
      this._windowStartMs = now;
      this._used = 0;
    }
    if (this._used < this._maxPerSecond) {
      this._used++;
      return true;
    }
    return this._fallback.shouldSample(traceId);
  }
}

/** A tail-sampling policy inspects a finished trace and votes keep/drop/abstain. */
export interface ITailPolicy {
  readonly name: string;
  /**
   * @returns 'keep' to force-sample, 'drop' to force-drop, 'abstain' to defer
   *          to the next policy / baseline sampler.
   */
  evaluate(traceId: string, spans: ReadonlyArray<SpanSignal>): 'keep' | 'drop' | 'abstain';
}

/** Keep any trace containing at least one ERROR-status span. */
export class ErrorTailPolicy implements ITailPolicy {
  readonly name = 'error';
  evaluate(_traceId: string, spans: ReadonlyArray<SpanSignal>): 'keep' | 'abstain' {
    return spans.some((s) => s.statusCode === 'ERROR') ? 'keep' : 'abstain';
  }
}

/** Keep traces whose root-span (or longest) duration exceeds a threshold. */
export class LatencyTailPolicy implements ITailPolicy {
  readonly name = 'latency';
  private readonly _thresholdMs: number;

  constructor(thresholdMs: number) {
    this._thresholdMs = thresholdMs;
  }

  evaluate(_traceId: string, spans: ReadonlyArray<SpanSignal>): 'keep' | 'abstain' {
    for (const s of spans) {
      if (s.endTimeMs - s.startTimeMs >= this._thresholdMs) return 'keep';
    }
    return 'abstain';
  }
}

/** Keep traces that carry a specific attribute value on any span. */
export class AttributeTailPolicy implements ITailPolicy {
  readonly name = 'attribute';
  private readonly _key: string;
  private readonly _value: string | number | boolean;

  constructor(key: string, value: string | number | boolean) {
    this._key = key;
    this._value = value;
  }

  evaluate(_traceId: string, spans: ReadonlyArray<SpanSignal>): 'keep' | 'abstain' {
    for (const s of spans) {
      if (s.attributes && s.attributes[this._key] === this._value) return 'keep';
    }
    return 'abstain';
  }
}

interface PendingTrace {
  spans: SpanSignal[];
  firstSeenMs: number;
  rootSeen: boolean;
}

export interface TailSamplerConfig {
  /** How long to hold a partial trace before deciding anyway (ms). */
  readonly decisionWindowMs: number;
  /** Maximum distinct trace ids buffered; oldest are evicted with a drop decision. */
  readonly maxPendingTraces: number;
  readonly policies: ReadonlyArray<ITailPolicy>;
  /** Baseline probability applied when no policy voted 'keep'. */
  readonly baselineRatio: number;
}

export interface TailDecision {
  readonly traceId: string;
  readonly keep: boolean;
  readonly reason: string;
  readonly spans: ReadonlyArray<SpanSignal>;
}

/**
 * Tail-based sampler. Buffers spans per trace id in a Map (O(1) lookup).
 * A decision is made when:
 *   a) a span with no parent arrives (root span ends the trace), or
 *   b) `decisionWindowMs` elapsed since the first span, or
 *   c) capacity pressure evicts the oldest pending trace.
 *
 * `flushReady()` is driven by the caller (or a timer) and returns the
 * decided traces so an exporter can ship or discard them.
 */
export class TailBasedSampler {
  readonly name = 'tail-based';
  private readonly _config: TailSamplerConfig;
  private readonly _clock: IClock;
  private readonly _pending: Map<string, PendingTrace> = new Map();
  private readonly _baseline: HeadBasedSampler;
  private _decisions: TailDecision[] = [];

  constructor(config: TailSamplerConfig, clock: IClock = new SystemClock()) {
    this._config = config;
    this._clock = clock;
    this._baseline = new HeadBasedSampler(config.baselineRatio);
  }

  /** Ingest a span belonging to a trace. */
  addSpan(span: SpanSignal): void {
    let t = this._pending.get(span.traceId);
    if (!t) {
      if (this._pending.size >= this._config.maxPendingTraces) {
        // Evict the oldest pending trace with a forced decision.
        const oldestKey = this._pending.keys().next().value;
        if (oldestKey !== undefined) {
          const oldest = this._pending.get(oldestKey);
          this._pending.delete(oldestKey);
          if (oldest) this._decide(oldestKey, oldest, 'evicted-capacity');
        }
      }
      t = { spans: [], firstSeenMs: this._clock.nowMs(), rootSeen: false };
      this._pending.set(span.traceId, t);
    }
    t.spans.push(span);
    if (!span.parentSpanId) t.rootSeen = true;
    if (t.rootSeen) {
      this._pending.delete(span.traceId);
      this._decide(span.traceId, t, 'root-complete');
    }
  }

  /** Decide any traces that have outlived the decision window. */
  flushReady(): TailDecision[] {
    const now = this._clock.nowMs();
    for (const [traceId, t] of this._pending) {
      if (now - t.firstSeenMs >= this._config.decisionWindowMs) {
        this._pending.delete(traceId);
        this._decide(traceId, t, 'window-expired');
      }
    }
    const out = this._decisions;
    this._decisions = [];
    return out;
  }

  pendingCount(): number {
    return this._pending.size;
  }

  private _decide(traceId: string, t: PendingTrace, trigger: string): void {
    for (const policy of this._config.policies) {
      const vote = policy.evaluate(traceId, t.spans);
      if (vote === 'keep') {
        this._decisions.push({ traceId, keep: true, reason: `${policy.name}:${trigger}`, spans: t.spans });
        return;
      }
      if (vote === 'drop') {
        this._decisions.push({ traceId, keep: false, reason: `${policy.name}:${trigger}`, spans: t.spans });
        return;
      }
    }
    const keep = this._baseline.shouldSample(traceId);
    this._decisions.push({ traceId, keep, reason: `baseline:${trigger}`, spans: t.spans });
  }
}

/** Composite sampler: ORs several samplers (any keep wins). */
export class CompositeSampler implements ISampler {
  readonly name = 'composite';
  private readonly _samplers: ReadonlyArray<ISampler>;

  constructor(samplers: ReadonlyArray<ISampler>) {
    this._samplers = samplers;
  }

  shouldSample(traceId: string, context?: SamplingContext): boolean {
    for (const s of this._samplers) {
      if (s.shouldSample(traceId, context)) return true;
    }
    return false;
  }
}
