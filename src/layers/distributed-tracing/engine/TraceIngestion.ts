/**
 * Trace Ingestion Pipeline
 *
 * Ties the tracing primitives together into a full ingest path:
 *
 *   raw span ingestion → trace assembly → clock-skew correction →
 *   tail-based sampling → batch export
 *
 * `TraceIngestion` is the top-level facade a service would wire in: it
 * owns the span buffer, drives the `TailBasedSampler`, reconstructs
 * `SpanTree`s for decided traces and forwards kept traces to a batch
 * exporter.
 *
 * @module DistributedTracingLayer/Engine
 */

import { IClock, ManualClock, SystemClock, TailBasedSampler, TailDecision } from '../../observability/engine';
import { SpanSnapshot, SpanTree } from './Span';
import { BatchSpanProcessor, ISpanExporter } from './SpanProcessor';

export interface IngestStats {
  spansReceived: number;
  tracesKept: number;
  tracesDropped: number;
  correctionsApplied: number;
  exportErrors: number;
}

/** Configuration for the whole ingest path. */
export interface TraceIngestionConfig {
  readonly tailSampler: TailBasedSampler;
  /** Max spans kept per assembled trace (safety bound). */
  readonly maxSpansPerTrace?: number;
  /** Clock-skew correction on/off. */
  readonly correctClockSkew?: boolean;
  readonly serviceName?: string;
}

/** A finished, corrected trace ready for export. */
export interface AssembledTrace {
  readonly traceId: string;
  readonly spans: ReadonlyArray<SpanSnapshot>;
  readonly correctionsApplied: number;
  readonly keep: boolean;
  readonly reason: string;
}

/**
 * The ingest pipeline. `ingestSpan` accepts finished span snapshots
 * (from local instrumentation or forwarded from other services),
 * buffers them per-trace in the tail sampler, and returns decisions as
 * traces complete.
 *
 * Call `flushDecisions()` periodically (or on a timer) to drain the
 * sampler's decision window.
 */
export class TraceIngestion {
  private readonly _config: TraceIngestionConfig;
  private readonly _clock: IClock;
  private readonly _exporter: ISpanExporter;
  private readonly _processor: BatchSpanProcessor;
  private _stats: IngestStats = {
    spansReceived: 0,
    tracesKept: 0,
    tracesDropped: 0,
    correctionsApplied: 0,
    exportErrors: 0,
  };

  constructor(
    config: TraceIngestionConfig,
    exporter: ISpanExporter,
    clock: IClock = new SystemClock()
  ) {
    this._config = config;
    this._clock = clock;
    this._exporter = exporter;
    this._processor = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 512, scheduleDelayMs: 0, maxQueueSize: 8_192, dropPolicy: 'drop-oldest' },
      clock
    );
  }

  /** Accept one finished span. */
  ingestSpan(span: SpanSnapshot): void {
    this._stats.spansReceived++;
    this._config.tailSampler.addSpan({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      startTimeMs: span.startTimeMs,
      endTimeMs: span.endTimeMs,
      statusCode: span.status.code,
      attributes: span.attributes as Record<string, string | number | boolean>,
    });
  }

  /**
   * Drain ready decisions from the tail sampler, assemble each kept
   * trace, apply clock-skew correction, and enqueue spans for export.
   * Returns the assembled traces for inspection/testing.
   */
  flushDecisions(): AssembledTrace[] {
    const decisions = this._config.tailSampler.flushReady();
    const out: AssembledTrace[] = [];
    for (const d of decisions) {
      const assembled = this._assemble(d);
      out.push(assembled);
      if (assembled.keep) {
        this._stats.tracesKept++;
        for (const s of assembled.spans) this._processor.onEnd(s);
      } else {
        this._stats.tracesDropped++;
      }
      this._stats.correctionsApplied += assembled.correctionsApplied;
    }
    return out;
  }

  private _assemble(d: TailDecision): AssembledTrace {
    // Convert tail-sampler SpanSignal back into SpanSnapshot-ish records.
    // The sampler only carries the minimal fields; real deployments would
    // pair this with a span store holding the full record.
    const snapshots: SpanSnapshot[] = d.spans.slice(0, this._config.maxSpansPerTrace ?? 10_000).map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      kind: 'internal' as const,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      status: { code: s.statusCode },
      attributes: (s.attributes ?? {}) as Record<string, string | number | boolean>,
      events: [],
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
    }));

    let corrected = snapshots;
    let corrections = 0;
    if (this._config.correctClockSkew !== false && snapshots.length > 1) {
      const tree = new SpanTree(snapshots);
      corrected = tree.correctClockSkew();
      for (let i = 0; i < snapshots.length; i++) {
        const c = corrected.find((x) => x.spanId === snapshots[i].spanId);
        if (c && (c.startTimeMs !== snapshots[i].startTimeMs || c.endTimeMs !== snapshots[i].endTimeMs)) {
          corrections++;
        }
      }
    }
    return {
      traceId: d.traceId,
      spans: corrected,
      correctionsApplied: corrections,
      keep: d.keep,
      reason: d.reason,
    };
  }

  /** Flush queued spans to the exporter. */
  async flushExport(): Promise<void> {
    try {
      await this._processor.flush();
    } catch {
      this._stats.exportErrors++;
    }
  }

  pendingTraces(): number {
    return this._config.tailSampler.pendingCount();
  }

  getStats(): IngestStats {
    return { ...this._stats };
  }
}
