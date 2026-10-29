/**
 * Span Processor Pipeline
 *
 * Completed spans flow through a chain of processors:
 *
 *   span.end() → SpanProcessor.onEnd() → [filter / enrich / redact]
 *              → queue → BatchExporter.flush() → exporter(spans[])
 *
 * Two processors are provided:
 *   - `SimpleSpanProcessor` — forwards every span immediately (debug).
 *   - `BatchSpanProcessor` — queues spans and flushes them in batches
 *     either when the batch fills, when a scheduled delay elapses, or on
 *     explicit `flush()`. Queue overflow applies a configurable drop
 *     policy, mirroring the observability router's behaviour.
 *
 * The exporter interface is intentionally tiny — one method, one promise
 * — so tests can inject recording fakes and production can wrap HTTP
 * OTLP endpoints, file writers, or Kafka producers.
 *
 * @module DistributedTracingLayer/Engine
 */

import { IClock, ManualClock, SystemClock } from '../../observability/engine/signals';
import { SpanSnapshot } from './Span';

/** Terminal destination for batches of finished spans. */
export interface ISpanExporter {
  readonly name: string;
  /**
   * Deliver a batch. Rejects/throws are caught by the processor and
   * surfaced via `onExportError`; spans are then retried or dropped
   * according to the processor's policy.
   */
  export(spans: ReadonlyArray<SpanSnapshot>): Promise<void>;
  shutdown?(): Promise<void>;
}

/** A processor mutates and forwards spans through the pipeline. */
export interface ISpanProcessor {
  onEnd(span: SpanSnapshot): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Pre-export hook — can mutate attributes or veto the span entirely. */
export type SpanFilter = (span: SpanSnapshot) => SpanSnapshot | undefined;

/** Drop policy when the internal queue is full. */
export type QueueDropPolicy = 'drop-newest' | 'drop-oldest' | 'reject';

export interface BatchProcessorConfig {
  /** Flush when the queue reaches this many spans. */
  readonly maxBatchSize: number;
  /** Flush every N ms regardless of queue depth (0 = manual only). */
  readonly scheduleDelayMs: number;
  /** Hard bound on queued spans; overflow triggers `dropPolicy`. */
  readonly maxQueueSize: number;
  readonly dropPolicy: QueueDropPolicy;
  /** Max attempts per batch before it's dropped with an error callback. */
  readonly maxRetries?: number;
}

const DEFAULT_CONFIG: BatchProcessorConfig = {
  maxBatchSize: 512,
  scheduleDelayMs: 5_000,
  maxQueueSize: 2_048,
  dropPolicy: 'drop-oldest',
  maxRetries: 3,
};

export interface ProcessorStats {
  received: number;
  exported: number;
  droppedQueueOverflow: number;
  exportErrors: number;
  exportRetries: number;
  flushes: number;
}

/**
 * Pass-through processor — every ended span is exported immediately in
 * a one-element batch. Useful for debugging and unit tests.
 */
export class SimpleSpanProcessor implements ISpanProcessor {
  private readonly _exporter: ISpanExporter;
  private readonly _filter?: SpanFilter;
  private _pending: Promise<void> = Promise.resolve();

  constructor(exporter: ISpanExporter, filter?: SpanFilter) {
    this._exporter = exporter;
    this._filter = filter;
  }

  onEnd(span: SpanSnapshot): void {
    const out = this._filter ? this._filter(span) : span;
    if (!out) return;
    // Serialize exports so ordering is preserved.
    this._pending = this._pending.then(() => this._exporter.export([out]));
  }

  async flush(): Promise<void> {
    await this._pending;
  }

  async shutdown(): Promise<void> {
    await this.flush();
    await this._exporter.shutdown?.();
  }
}

/**
 * Batching processor with a bounded queue.
 *
 * Invariants:
 *   - `queue.length <= maxQueueSize` at all times
 *   - exports are serialized (one in flight at a time)
 *   - on export failure the batch is retried up to `maxRetries` times
 *     with linear backoff driven by the injected clock, then dropped.
 */
export class BatchSpanProcessor implements ISpanProcessor {
  private readonly _exporter: ISpanExporter;
  private readonly _config: BatchProcessorConfig;
  private readonly _clock: IClock;
  private readonly _filters: SpanFilter[];
  private _queue: SpanSnapshot[] = [];
  private _stats: ProcessorStats = {
    received: 0,
    exported: 0,
    droppedQueueOverflow: 0,
    exportErrors: 0,
    exportRetries: 0,
    flushes: 0,
  };
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _exporting: Promise<void> = Promise.resolve();
  private _shutdown = false;
  private _onDrop?: (spans: ReadonlyArray<SpanSnapshot>, reason: string) => void;

  constructor(
    exporter: ISpanExporter,
    config: Partial<BatchProcessorConfig> = {},
    clock: IClock = new SystemClock(),
    filters: ReadonlyArray<SpanFilter> = [],
    onDrop?: (spans: ReadonlyArray<SpanSnapshot>, reason: string) => void
  ) {
    this._exporter = exporter;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._clock = clock;
    this._filters = [...filters];
    this._onDrop = onDrop;
  }

  onEnd(span: SpanSnapshot): void {
    if (this._shutdown) return;
    this._stats.received++;

    let out: SpanSnapshot | undefined = span;
    for (const f of this._filters) {
      if (!out) break;
      out = f(out);
    }
    if (!out) return;

    if (this._queue.length >= this._config.maxQueueSize) {
      this._handleOverflow(out);
      return;
    }
    this._queue.push(out);

    if (this._queue.length >= this._config.maxBatchSize) {
      void this.flush();
    } else if (this._config.scheduleDelayMs > 0 && !this._timer) {
      this._timer = setTimeout(() => {
        this._timer = null;
        void this.flush();
      }, this._config.scheduleDelayMs);
      // Don't keep the event loop alive solely for the flush timer.
      if (typeof this._timer === 'object' && this._timer && 'unref' in this._timer) {
        (this._timer as { unref(): void }).unref();
      }
    }
  }

  private _handleOverflow(incoming: SpanSnapshot): void {
    switch (this._config.dropPolicy) {
      case 'reject':
      case 'drop-newest':
        this._stats.droppedQueueOverflow++;
        this._onDrop?.([incoming], 'queue-full-newest');
        return;
      case 'drop-oldest': {
        const evicted = this._queue.shift();
        this._queue.push(incoming);
        this._stats.droppedQueueOverflow++;
        if (evicted) this._onDrop?.([evicted], 'queue-full-oldest');
        return;
      }
    }
  }

  /**
   * Drain the queue into batches and export them serially.
   * Concurrent `flush()` calls are coalesced behind one promise chain.
   */
  flush(): Promise<void> {
    this._exporting = this._exporting.then(() => this._drain());
    return this._exporting;
  }

  private async _drain(): Promise<void> {
    while (this._queue.length > 0) {
      const batch = this._queue.splice(0, this._config.maxBatchSize);
      let attempt = 0;
      const maxRetries = this._config.maxRetries ?? 3;
      for (;;) {
        try {
          await this._exporter.export(batch);
          this._stats.exported += batch.length;
          this._stats.flushes++;
          break;
        } catch (err) {
          this._stats.exportErrors++;
          attempt++;
          if (attempt > maxRetries) {
            this._onDrop?.(batch, `export-failed:${err instanceof Error ? err.message : String(err)}`);
            break;
          }
          this._stats.exportRetries++;
          // Deterministic linear backoff — tests use ManualClock so no
          // real sleeping happens.
          await this._sleep(attempt * 50);
        }
      }
    }
  }

  private _sleep(ms: number): Promise<void> {
    if (this._clock instanceof ManualClock) {
      // In tests, the clock is manual — resolve immediately to keep
      // flush() deterministic and synchronous-ish.
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    await this.flush();
    await this._exporter.shutdown?.();
  }

  queueSize(): number {
    return this._queue.length;
  }

  getStats(): ProcessorStats {
    return { ...this._stats };
  }
}

/** Recording exporter for tests and for bridging into the obs router. */
export class InMemorySpanExporter implements ISpanExporter {
  readonly name = 'in-memory';
  readonly batches: SpanSnapshot[][] = [];
  failNextCount = 0;

  async export(spans: ReadonlyArray<SpanSnapshot>): Promise<void> {
    if (this.failNextCount > 0) {
      this.failNextCount--;
      throw new Error('injected export failure');
    }
    this.batches.push([...spans]);
  }

  allSpans(): SpanSnapshot[] {
    return this.batches.flat();
  }

  clear(): void {
    this.batches.length = 0;
  }
}
