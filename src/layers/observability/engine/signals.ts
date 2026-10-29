/**
 * Observability Signal Types
 *
 * Core type definitions for the unified telemetry engine: metrics, logs,
 * and traces are modelled as a common `TelemetrySignal` envelope that can
 * be routed, sampled, redacted, buffered and exported through a single
 * pipeline. The shapes borrow heavily from OpenTelemetry's data model
 * (resource + scope + signal records) but are self-contained.
 *
 * @module ObservabilityLayer/Engine
 */

/** Supported telemetry signal kinds. */
export type SignalKind = 'metric' | 'log' | 'trace';

/** Severity levels, aligned with the OTLP severity number ranges. */
export type LogSeverity = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Numeric severity mapping used for filtering / comparisons. */
export const SEVERITY_RANK: Record<LogSeverity, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

/** Metric temporality used by exporters. */
export type AggregationTemporality = 'delta' | 'cumulative';

/** Supported metric flavours. */
export type MetricKind = 'counter' | 'gauge' | 'histogram' | 'summary';

/** Baggage / attribute value — deliberately narrow to stay serializable. */
export type AttributeValue = string | number | boolean | AttributeValue[];

/** A flat attribute map attached to signals and resources. */
export type Attributes = Record<string, AttributeValue | undefined>;

/**
 * Resource describes the entity producing telemetry (service name,
 * host, k8s pod, etc.). Copied onto every exported signal batch.
 */
export interface Resource {
  readonly attributes: Attributes;
}

/** Common envelope for every telemetry record flowing through the router. */
export interface TelemetrySignal {
  /** Discriminates the union used by sinks and samplers. */
  readonly kind: SignalKind;
  /** Monotonic timestamp (ms since epoch) captured at ingestion. */
  readonly timestampMs: number;
  /** W3C trace/span identifiers when the signal is correlated. */
  readonly traceId?: string;
  readonly spanId?: string;
  /** Free-form signal attributes (sanitized before export). */
  attributes: Attributes;
}

/** A single metric data point (post-aggregation). */
export interface MetricDataPoint {
  readonly name: string;
  readonly kind: MetricKind;
  readonly value: number;
  readonly temporality: AggregationTemporality;
  /** Histogram/summary extras — bucket counts and cumulative boundaries. */
  readonly buckets?: ReadonlyArray<{ readonly le: number; readonly count: number }>;
  readonly count?: number;
  readonly sum?: number;
  readonly min?: number;
  readonly max?: number;
}

/** Raw metric measurement submitted by instrumentation. */
export interface MetricMeasurement {
  readonly name: string;
  readonly value: number;
  readonly kind: MetricKind;
  readonly attributes?: Attributes;
  readonly timestampMs?: number;
}

/** Structured log record. */
export interface LogRecord {
  readonly severity: LogSeverity;
  readonly body: string;
  readonly attributes?: Attributes;
  readonly timestampMs?: number;
  readonly traceId?: string;
  readonly spanId?: string;
}

/** Minimal span data needed by the router/sampler (full model lives in the tracing layer). */
export interface SpanSignal {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly statusCode: 'OK' | 'ERROR' | 'UNSET';
  readonly attributes?: Attributes;
}

/**
 * A sink receives fully-formed signal batches. Sinks are intentionally
 * synchronous-friendly: the router never awaits them, it hands off an
 * immutable snapshot so a slow sink cannot block the hot path.
 */
export interface ISignalSink {
  readonly name: string;
  /** Signal kinds this sink accepts. */
  accepts(kind: SignalKind): boolean;
  /** Deliver a batch; implementations must not mutate the array. */
  write(signals: ReadonlyArray<TelemetrySignal>): void;
  /** Optional flush hook called by the router during shutdown/drain. */
  flush?(): void;
}

/** Drop policies applied when a bounded buffer reaches capacity. */
export type DropPolicy = 'drop-newest' | 'drop-oldest' | 'drop-lowest-severity' | 'reject';

/** Result of a routing decision, surfaced for diagnostics. */
export interface RouteDecision {
  readonly sink: string;
  readonly matched: boolean;
  readonly rule?: string;
}

/** Deterministic injectable clock so tests control time. */
export interface IClock {
  nowMs(): number;
}

/** Default wall-clock implementation. */
export class SystemClock implements IClock {
  nowMs(): number {
    return Date.now();
  }
}

/**
 * Mutable clock for tests: callers advance time explicitly so TTL and
 * window behaviour is deterministic without timers.
 */
export class ManualClock implements IClock {
  private _now: number;

  constructor(startMs = 0) {
    this._now = startMs;
  }

  nowMs(): number {
    return this._now;
  }

  advance(ms: number): void {
    this._now += ms;
  }

  set(ms: number): void {
    this._now = ms;
  }
}

/** Type guards over the loose `unknown` values that cross the pipeline. */
export function isMetricSignal(s: TelemetrySignal): s is TelemetrySignal & { metric: MetricDataPoint } {
  return s.kind === 'metric';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
