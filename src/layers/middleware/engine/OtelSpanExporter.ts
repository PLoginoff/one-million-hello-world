/**
 * OTLP JSON Span Exporter
 *
 * Batches finished spans and exports them as an OTLP/JSON
 * `ExportTraceServiceRequest` document — the wire format of the
 * OpenTelemetry Protocol over HTTP.
 *
 * Design:
 * - In-memory queue with bounded depth; overflow evicts the *oldest*
 *   spans so a telemetry outage can never blow up the host process.
 * - Auto-flush when the queue reaches `maxBatchSize`.
 * - Manual `flush()` drains the whole queue into one or more batches.
 * - `toOtelSpan()` converts our span records into OTLP `Span` objects:
 *   epoch nanos as decimal strings (int64 JSON mapping), attributes as
 *   typed `AnyValue` key-values, status codes mapped to
 *   `STATUS_CODE_{UNSET,OK,ERROR}`.
 * - Export is retry-free by design — a failed sink call re-queues
 *   the batch at the tail (drop-oldest still applies).
 *
 * Complexity:
 * - enqueue: O(1) amortized (drop-oldest on overflow)
 * - flush: O(n) over queued spans, O(1) memory beyond the payload
 *
 * @module MiddlewareLayer/Engine
 */

import {
  OtelAnyValue,
  OtelExportRequest,
  OtelExporterConfig,
  OtelKeyValue,
  OtelResourceSpans,
  OtelScopeSpans,
  OtelSpan,
  OtelSpanEvent,
  OtelSpanKind,
  OtelStatusCode,
  SpanExportSink,
} from './types';
import { SpanStatus, TraceSpan } from '../types/middleware-types';

/**
 * Convert milliseconds to the nanosecond int64 string the OTLP JSON
 * mapping requires. Avoids float precision loss by splitting integer
 * and fractional parts.
 */
export function millisToUnixNano(ms: number): string {
  const whole = Math.floor(ms);
  const frac = ms - whole;
  // whole * 1e6 gives milliseconds->nanos via microsecond integer math
  const nanos = whole * 1_000_000 + Math.round(frac * 1_000_000);
  return String(nanos);
}

/**
 * Encode an arbitrary attribute value as an OTLP `AnyValue`.
 * Non-scalar values degrade to strings (OTLP `AnyValue` has no generic
 * object kind; complex data belongs in events/logs anyway).
 */
export function toAnyValue(value: unknown): OtelAnyValue {
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: value } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toAnyValue(v)) } };
  }
  if (value !== null && typeof value === 'object') {
    const values: OtelKeyValue[] = Object.entries(value as Record<string, unknown>).map(
      ([key, v]) => ({ key, value: toAnyValue(v) })
    );
    return { kvlistValue: { values } };
  }
  return { stringValue: String(value) };
}

/**
 * Map an internal {@link SpanStatus} to an OTLP status code.
 */
export function toOtelStatus(status: SpanStatus | undefined): OtelStatusCode {
  switch (status) {
    case SpanStatus.OK:
      return OtelStatusCode.OK;
    case SpanStatus.ERROR:
    case SpanStatus.TIMEOUT:
      return OtelStatusCode.ERROR;
    default:
      return OtelStatusCode.UNSET;
  }
}

/**
 * Convert a {@link TraceSpan} record to an OTLP `Span`.
 *
 * @param span     Internal span record (may be unfinished).
 * @param kind     OTLP span kind (SERVER for inbound middleware spans).
 * @param endNanos Override end timestamp for unfinished spans.
 */
export function toOtelSpan(
  span: TraceSpan,
  kind: OtelSpanKind = OtelSpanKind.SERVER,
  endNanos?: string
): OtelSpan {
  const attributes: OtelKeyValue[] = Object.entries(span.tags ?? {}).map(([key, value]) => ({
    key,
    value: toAnyValue(value),
  }));

  if (span.error !== undefined) {
    attributes.push({ key: 'exception.type', value: { stringValue: span.error.type } });
    attributes.push({ key: 'exception.message', value: { stringValue: span.error.message } });
  }

  const events: OtelSpanEvent[] = (span.events ?? []).map((event) => ({
    timeUnixNano: millisToUnixNano(event.timestamp.getTime()),
    name: event.name,
    attributes: Object.entries(event.attributes ?? {}).map(([key, value]) => ({
      key,
      value: toAnyValue(value),
    })),
  }));

  const links = (span.links ?? []).map((link) => ({
    traceId: link.traceId,
    spanId: link.spanId,
    attributes: Object.entries(link.attributes ?? {}).map(([key, value]) => ({
      key,
      value: toAnyValue(value),
    })),
  }));

  const end = span.endTime !== undefined ? millisToUnixNano(span.endTime.getTime()) : endNanos;
  if (end === undefined) {
    throw new Error('Cannot export unfinished span without an end timestamp');
  }

  const otelSpan: OtelSpan = {
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.operationName,
    kind,
    startTimeUnixNano: millisToUnixNano(span.startTime.getTime()),
    endTimeUnixNano: end,
    attributes,
    events,
    links,
    status: {
      code: toOtelStatus(span.status),
      message: span.error?.message,
    },
  };
  if (span.parentSpanId !== undefined) {
    return { ...otelSpan, parentSpanId: span.parentSpanId };
  }
  return otelSpan;
}

/**
 * Batching span exporter with bounded queue.
 */
export class OtelSpanExporter {
  private readonly _config: OtelExporterConfig;
  private readonly _sink: SpanExportSink;
  private readonly _queue: OtelSpan[];

  private _droppedCount: number;
  private _exportedCount: number;
  private _exportFailures: number;

  constructor(sink: SpanExportSink, config?: Partial<OtelExporterConfig>) {
    this._sink = sink;
    this._config = {
      maxBatchSize: config?.maxBatchSize ?? 64,
      maxQueueSize: config?.maxQueueSize ?? 2048,
      serviceName: config?.serviceName ?? 'one-million-hello-world',
      serviceVersion: config?.serviceVersion,
      resourceAttributes: config?.resourceAttributes,
    };
    this._queue = [];
    this._droppedCount = 0;
    this._exportedCount = 0;
    this._exportFailures = 0;
  }

  /** Number of spans currently buffered. */
  get pendingCount(): number {
    return this._queue.length;
  }

  /** Spans dropped due to queue overflow. */
  get droppedCount(): number {
    return this._droppedCount;
  }

  /** Spans successfully exported. */
  get exportedCount(): number {
    return this._exportedCount;
  }

  /** Failed export attempts. */
  get exportFailures(): number {
    return this._exportFailures;
  }

  /**
   * Enqueue a finished span for export.
   *
   * If the queue is full, the oldest span is dropped (bounded memory
   * guarantee). Flushes automatically once `maxBatchSize` is reached.
   */
  async record(span: OtelSpan): Promise<void> {
    if (this._queue.length >= this._config.maxQueueSize) {
      this._queue.shift();
      this._droppedCount++;
    }
    this._queue.push(span);

    if (this._queue.length >= this._config.maxBatchSize) {
      await this.flushBatch(this._config.maxBatchSize);
    }
  }

  /**
   * Convenience: convert and enqueue a finished {@link TraceSpan}.
   */
  async recordTraceSpan(span: TraceSpan, kind: OtelSpanKind = OtelSpanKind.SERVER): Promise<void> {
    await this.record(toOtelSpan(span, kind));
  }

  /**
   * Drain the entire queue into one or more export payloads.
   * Each payload holds at most `maxBatchSize` spans.
   */
  async flush(): Promise<number> {
    let total = 0;
    while (this._queue.length > 0) {
      total += await this.flushBatch(this._config.maxBatchSize);
    }
    return total;
  }

  /**
   * Export up to `limit` spans from the head of the queue in a single
   * OTLP payload. On sink failure the batch is re-queued at the tail
   * (subject to overflow eviction) so telemetry loss is bounded but
   * transient outages don't silently drop data.
   *
   * @returns Number of spans exported.
   */
  private async flushBatch(limit: number): Promise<number> {
    const batch = this._queue.splice(0, limit);
    if (batch.length === 0) {
      return 0;
    }

    const payload = this.buildExportRequest(batch);
    try {
      await this._sink.export(payload);
      this._exportedCount += batch.length;
      return batch.length;
    } catch {
      this._exportFailures++;
      // Re-queue at the tail, respecting max queue size.
      for (const span of batch) {
        if (this._queue.length >= this._config.maxQueueSize) {
          this._queue.shift();
          this._droppedCount++;
        }
        this._queue.push(span);
      }
      return 0;
    }
  }

  /**
   * Wrap a set of OTLP spans into an `ExportTraceServiceRequest`
   * with a single ResourceSpans/ScopeSpans group (all spans belong to
   * this service and instrumentation scope).
   */
  buildExportRequest(spans: OtelSpan[]): OtelExportRequest {
    const resourceAttributes: OtelKeyValue[] = [
      { key: 'service.name', value: { stringValue: this._config.serviceName } },
    ];
    if (this._config.serviceVersion !== undefined) {
      resourceAttributes.push({
        key: 'service.version',
        value: { stringValue: this._config.serviceVersion },
      });
    }
    for (const [key, value] of Object.entries(this._config.resourceAttributes ?? {})) {
      resourceAttributes.push({ key, value: toAnyValue(value) });
    }

    const scopeSpans: OtelScopeSpans = {
      scope: { name: 'middleware-engine', version: '1.0.0' },
      spans,
    };

    const resourceSpans: OtelResourceSpans = {
      resource: { attributes: resourceAttributes },
      scopeSpans: [scopeSpans],
    };

    return { resourceSpans: [resourceSpans] };
  }
}
