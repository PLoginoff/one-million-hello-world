/**
 * Middleware Engine — Shared Types
 *
 * Type definitions for the executable middleware pipeline core:
 * - Request/response pipeline abstraction (transport-agnostic)
 * - Middleware function signatures and registration options
 * - Conditional execution predicates (path / method / header matchers)
 * - Per-middleware timeout configuration
 * - OpenTelemetry-compatible span model (OTLP JSON)
 * - Duration histogram structures for middleware metrics
 *
 * Unlike the `domain/` tree — which models middleware *metadata* —
 * this module models middleware *execution*: real dispatch, real
 * span trees, real latency capture.
 *
 * @module MiddlewareLayer/Engine
 */

/**
 * Pipeline request flowing through middleware.
 *
 * A plain data record — the engine makes no assumption about the
 * underlying HTTP implementation so it works in tests and across
 * transport adapters.
 */
export interface PipelineRequest {
  /** Unique request identifier (generated if absent). */
  readonly id: string;
  /** HTTP method, upper-case (GET, POST, ...). */
  readonly method: string;
  /** URL path without query string. */
  readonly path: string;
  /** Request headers, lower-case names, single values. */
  readonly headers: Record<string, string>;
  /** Optional deserialized body. */
  readonly body?: unknown;
  /** Free-form bag; middleware may attach data for later stages. */
  readonly state: Record<string, unknown>;
}

/**
 * Pipeline response produced by the terminal handler or a middleware
 * that short-circuits the chain (e.g. auth rejection).
 */
export interface PipelineResponse {
  /** Numeric HTTP-style status code. */
  status: number;
  /** Response headers. */
  headers: Record<string, string>;
  /** Response payload. */
  body?: unknown;
}

/**
 * Next-function passed to each middleware. Calling `next()` invokes
 * the remaining chain and resolves with its response. A middleware may
 * instead return a response itself, short-circuiting the pipeline.
 */
export type PipelineNext = () => Promise<PipelineResponse>;

/**
 * Middleware function signature.
 *
 * Classic connect/express-style `(req, next) => res`, extended with
 * structured request state and promise-based composition.
 */
export type MiddlewareFunction = (
  request: PipelineRequest,
  next: PipelineNext
) => Promise<PipelineResponse>;

/**
 * Terminal handler at the bottom of the chain.
 */
export type PipelineHandler = (request: PipelineRequest) => Promise<PipelineResponse>;

/**
 * Predicate deciding whether a middleware runs for a given request.
 */
export type MiddlewarePredicate = (request: PipelineRequest) => boolean;

/**
 * Registration options for a single middleware in the composed chain.
 */
export interface MiddlewareRegistration {
  /** Human-readable name — used for spans, metrics and error reporting. */
  readonly name: string;
  /** The middleware function. */
  readonly fn: MiddlewareFunction;
  /**
   * Optional predicate(s). All must return true for the middleware
   * to execute. Skipped middleware still appear in span trees as
   * `SKIPPED` events for observability.
   */
  readonly predicates?: readonly MiddlewarePredicate[];
  /**
   * Per-middleware timeout in milliseconds. If the middleware exceeds
   * it, a `MiddlewareTimeoutError` is raised and (by default) the
   * whole pipeline fails with 504 semantics.
   */
  readonly timeoutMs?: number;
  /**
   * When true, a middleware failure is logged via the error listener
   * but the pipeline continues with the remaining chain instead of
   * aborting. Useful for non-critical observability middleware.
   */
  readonly continueOnError?: boolean;
}

/**
 * Execution record for one middleware invocation — the primary output
 * of the composition engine for metrics and tests.
 */
export interface MiddlewareInvocationRecord {
  /** Middleware name. */
  readonly name: string;
  /** Wall-clock duration in milliseconds (injectable clock). */
  readonly durationMs: number;
  /** Whether the middleware ran or was skipped by predicates. */
  readonly executed: boolean;
  /** Whether the middleware called `next()` (false => short-circuit). */
  readonly calledNext: boolean;
  /** Whether the invocation timed out. */
  readonly timedOut: boolean;
  /** Whether the invocation threw. */
  readonly failed: boolean;
  /** Error thrown, if any. */
  readonly error?: unknown;
  /** Order index in the composed chain. */
  readonly index: number;
}

/**
 * Full execution report for one pipeline pass.
 */
export interface PipelineExecutionReport {
  /** Request id. */
  readonly requestId: string;
  /** Invocation records in execution order. */
  readonly invocations: readonly MiddlewareInvocationRecord[];
  /** Total pipeline duration (ms). */
  readonly totalDurationMs: number;
  /** Final response. */
  readonly response: PipelineResponse;
}

// ---------------------------------------------------------------------------
// Correlation context
// ---------------------------------------------------------------------------

/**
 * Correlation identifiers propagated through the pipeline and any
 * async work spawned by middleware.
 */
export interface CorrelationContextSnapshot {
  /** End-to-end request correlation id (W3C `traceparent` or generated). */
  readonly correlationId: string;
  /** Distributed trace id (32-hex), distinct from correlation id. */
  readonly traceId: string;
  /** Current span id owning this context. */
  readonly spanId: string;
  /** Parent span id if this context was derived from a remote parent. */
  readonly parentSpanId?: string;
  /** Optional business-level request id. */
  readonly requestId?: string;
  /** Optional tenant / user scoping. */
  readonly tenantId?: string;
  readonly userId?: string;
}

/**
 * Trace flags per W3C Trace Context — bit 0 = sampled.
 */
export const TRACE_FLAG_SAMPLED = 0x01;

/**
 * Parsed W3C `traceparent` header.
 */
export interface TraceParent {
  readonly version: string;
  readonly traceId: string;
  readonly parentId: string;
  readonly flags: number;
}

// ---------------------------------------------------------------------------
// OTLP (OpenTelemetry Protocol) span model — JSON encoding
// ---------------------------------------------------------------------------

/**
 * OTLP span status codes per opentelemetry-proto `Status.StatusCode`.
 */
export enum OtelStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

/**
 * OTLP span kinds per opentelemetry-proto `Span.SpanKind`.
 */
export enum OtelSpanKind {
  UNSPECIFIED = 0,
  INTERNAL = 1,
  SERVER = 2,
  CLIENT = 3,
  PRODUCER = 4,
  CONSUMER = 5,
}

/**
 * OTLP `AnyValue` — only the scalar kinds we emit.
 */
export interface OtelAnyValue {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtelAnyValue[] };
  kvlistValue?: { values: OtelKeyValue[] };
}

/** OTLP `KeyValue`. */
export interface OtelKeyValue {
  key: string;
  value: OtelAnyValue;
}

/** OTLP `Span.Event`. */
export interface OtelSpanEvent {
  /** Nanoseconds since Unix epoch (string per JSON mapping for int64). */
  timeUnixNano: string;
  name: string;
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/** OTLP `Span.Link`. */
export interface OtelSpanLink {
  traceId: string;
  spanId: string;
  traceState?: string;
  attributes: OtelKeyValue[];
}

/** OTLP `Span`. */
export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceState?: string;
  name: string;
  kind: OtelSpanKind;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtelKeyValue[];
  events: OtelSpanEvent[];
  links: OtelSpanLink[];
  status: { code: OtelStatusCode; message?: string };
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
}

/** OTLP `ResourceSpans.scopeSpans[].scope`. */
export interface OtelInstrumentationScope {
  name: string;
  version?: string;
}

/** OTLP `ScopeSpans`. */
export interface OtelScopeSpans {
  scope: OtelInstrumentationScope;
  spans: OtelSpan[];
  schemaUrl?: string;
}

/** OTLP `ResourceSpans.resource`. */
export interface OtelResource {
  attributes: OtelKeyValue[];
  droppedAttributesCount?: number;
}

/** OTLP `ResourceSpans`. */
export interface OtelResourceSpans {
  resource: OtelResource;
  scopeSpans: OtelScopeSpans[];
  schemaUrl?: string;
}

/** OTLP `ExportTraceServiceRequest` — root JSON payload. */
export interface OtelExportRequest {
  resourceSpans: OtelResourceSpans[];
}

/**
 * Sink receiving serialized OTLP export batches. The exporter itself is
 * transport-free: a test stores payloads in memory, production could
 * ship them over HTTP/protobuf.
 */
export interface SpanExportSink {
  /** Called once per flushed batch with the serialized JSON document. */
  export(payload: OtelExportRequest): Promise<void>;
}

/** Exporter / batching configuration. */
export interface OtelExporterConfig {
  /** Maximum spans buffered before an automatic flush. */
  readonly maxBatchSize: number;
  /** Maximum queue depth; overflow drops oldest spans (bounded memory). */
  readonly maxQueueSize: number;
  /** Service name placed in resource attributes. */
  readonly serviceName: string;
  /** Service version placed in resource attributes. */
  readonly serviceVersion?: string;
  /** Additional resource attributes (deployment env, host, ...). */
  readonly resourceAttributes?: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Fixed-bucket histogram of observed durations for one middleware.
 *
 * Buckets are log-linear: explicit boundaries growing geometrically.
 * Structure mirrors Prometheus histograms so output can be scraped.
 */
export interface DurationHistogramSnapshot {
  /** Explicit bucket boundaries (ascending, ms). */
  readonly buckets: readonly number[];
  /** Cumulative counts: buckets[i] = count of samples <= buckets[i]. */
  readonly counts: readonly number[];
  /** Number of observations above the last bucket (+Inf). */
  readonly overflow: number;
  /** Total observation count. */
  readonly count: number;
  /** Sum of all observed values (ms) — avg = sum/count. */
  readonly sum: number;
  /** Min observed. */
  readonly min: number;
  /** Max observed. */
  readonly max: number;
}

/** Metrics snapshot for a single middleware. */
export interface MiddlewareMetricSnapshot {
  readonly name: string;
  readonly invocations: number;
  readonly skips: number;
  readonly failures: number;
  readonly timeouts: number;
  readonly shortCircuits: number;
  readonly duration: DurationHistogramSnapshot;
}
