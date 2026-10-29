/**
 * OTLP-style JSON Exporter
 *
 * Serializes signal batches into an OTLP/JSON-shaped document
 * (`resourceMetrics` / `resourceLogs` / `resourceSpans`). The output is
 * plain JSON — suitable for posting to an OTLP HTTP endpoint, writing to
 * a file, or asserting against in tests.
 *
 * The exporter is also an `ISignalSink`, so it can sit at the end of a
 * `SignalRouter` chain and convert the routed signal stream into a
 * wire-format document on `flush()`.
 *
 * @module ObservabilityLayer/Engine
 */

import {
  ISignalSink,
  LogSeverity,
  MetricDataPoint,
  Resource,
  SignalKind,
  TelemetrySignal,
} from './signals';

/** OTLP severity numbers (subset) — see opentelemetry-specification. */
const SEVERITY_NUMBER: Record<LogSeverity, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

/** The JSON document shape produced by `exportBatch()`. */
export interface OtlpJsonDocument {
  resource: { attributes: Array<{ key: string; value: unknown }> };
  resourceMetrics: Array<{
    scopeMetrics: Array<{ metrics: unknown[] }>;
  }>;
  resourceLogs: Array<{
    scopeLogs: Array<{ logRecords: unknown[] }>;
  }>;
  resourceSpans: Array<{
    scopeSpans: Array<{ spans: unknown[] }>;
  }>;
}

function attributesToOtlp(attrs: Record<string, unknown>): Array<{ key: string; value: unknown }> {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([key, v]) => ({ key, value: otlpAnyValue(v) }));
}

function otlpAnyValue(v: unknown): unknown {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { intValue: v } : { doubleValue: v };
  }
  if (typeof v === 'boolean') return { boolValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(otlpAnyValue) } };
  return { stringValue: String(v) };
}

function nsFromMs(ms: number): string {
  // OTLP uses string-encoded uint64 nanoseconds.
  return String(BigInt(Math.trunc(ms)) * 1_000_000n);
}

/**
 * Converts a batch of mixed signals into an OTLP/JSON document.
 * Pure function — easy to snapshot-test.
 */
export function exportBatch(
  signals: ReadonlyArray<TelemetrySignal>,
  resource: Resource
): OtlpJsonDocument {
  const metrics: unknown[] = [];
  const logs: unknown[] = [];
  const spans: unknown[] = [];

  for (const s of signals) {
    if (s.kind === 'metric') {
      const dp = s.attributes['dataPoint'] as MetricDataPoint | undefined;
      metrics.push({
        name: dp?.name ?? 'unknown',
        description: s.attributes['description'],
        data: {
          dataPoints: [
            {
              attributes: attributesToOtlp(s.attributes),
              startTimeUnixNano: nsFromMs(s.timestampMs),
              timeUnixNano: nsFromMs(s.timestampMs),
              ...(dp && dp.kind === 'histogram'
                ? {
                    explicitBounds: dp.buckets?.map((b) => b.le) ?? [],
                    bucketCounts: dp.buckets?.map((b) => b.count) ?? [],
                    count: dp.count,
                    sum: dp.sum,
                    min: dp.min,
                    max: dp.max,
                  }
                : { asDouble: dp?.value ?? 0 }),
            },
          ],
          aggregationTemporality: dp?.temporality === 'delta' ? 1 : 2,
        },
      });
    } else if (s.kind === 'log') {
      const sev = s.attributes['severity'] as LogSeverity | undefined;
      logs.push({
        timeUnixNano: nsFromMs(s.timestampMs),
        severityNumber: sev ? SEVERITY_NUMBER[sev] : 9,
        severityText: sev?.toUpperCase() ?? 'INFO',
        body: { stringValue: s.attributes['body'] ?? '' },
        attributes: attributesToOtlp(s.attributes),
        traceId: s.traceId,
        spanId: s.spanId,
      });
    } else {
      spans.push({
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.attributes['parentSpanId'],
        name: s.attributes['name'] ?? 'span',
        startTimeUnixNano: nsFromMs(s.timestampMs),
        endTimeUnixNano: nsFromMs(
          typeof s.attributes['endTimeMs'] === 'number' ? s.attributes['endTimeMs'] : s.timestampMs
        ),
        attributes: attributesToOtlp(s.attributes),
        status: {
          code:
            s.attributes['statusCode'] === 'ERROR'
              ? 2
              : s.attributes['statusCode'] === 'OK'
                ? 1
                : 0,
        },
      });
    }
  }

  return {
    resource: { attributes: attributesToOtlp(resource.attributes) },
    resourceMetrics: metrics.length ? [{ scopeMetrics: [{ metrics }] }] : [],
    resourceLogs: logs.length ? [{ scopeLogs: [{ logRecords: logs }] }] : [],
    resourceSpans: spans.length ? [{ scopeSpans: [{ spans }] }] : [],
  };
}

/**
 * Sink adapter: buffers routed signals and produces an OTLP document on
 * `flush()`/`document()`. Typical wiring:
 *
 *   router.addSink(new OtlpExportSink(resource, doc => post(doc)));
 */
export class OtlpExportSink implements ISignalSink {
  readonly name: string;
  private readonly _resource: Resource;
  private readonly _onFlush?: (doc: OtlpJsonDocument) => void;
  private _buffer: TelemetrySignal[] = [];
  private readonly _kinds?: ReadonlyArray<SignalKind>;

  constructor(
    resource: Resource,
    onFlush?: (doc: OtlpJsonDocument) => void,
    name = 'otlp',
    kinds?: ReadonlyArray<SignalKind>
  ) {
    this._resource = resource;
    this._onFlush = onFlush;
    this.name = name;
    this._kinds = kinds;
  }

  accepts(kind: SignalKind): boolean {
    return !this._kinds || this._kinds.includes(kind);
  }

  write(signals: ReadonlyArray<TelemetrySignal>): void {
    this._buffer.push(...signals);
  }

  /** Serialize current buffer into an OTLP document without clearing it. */
  document(): OtlpJsonDocument {
    return exportBatch(this._buffer, this._resource);
  }

  /** Serialize, invoke the flush callback, then clear the buffer. */
  flush(): OtlpJsonDocument {
    const doc = this.document();
    this._buffer = [];
    this._onFlush?.(doc);
    return doc;
  }

  bufferedCount(): number {
    return this._buffer.length;
  }
}
