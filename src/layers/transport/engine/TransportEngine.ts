/**
 * TransportEngine — facade over adapter + write queue + scheduler,
 * with graceful shutdown and metrics.
 *
 * Lifecycle:
 *   engine.start()
 *   engine.send(...) / engine.stream(...) / mux streams
 *   await engine.shutdown() → drains in-flight writes, then ends the
 *   adapter (with optional trailers), then resolves.
 *
 * `shutdown` races `drainTimeoutMs`: on timeout pending writes are
 * rejected and the adapter is aborted — callers get a
 * {@link DrainTimeoutError} while the engine still reaches a closed
 * state (no wedged shutdown).
 *
 * Metrics: bytes in/out are counted at the engine boundary — "out" is
 * post-encode wire bytes (adapter reports), "in" is fed by callers via
 * `receive` (e.g. a demux loop or request body reads).
 *
 * @module TransportLayer/Engine
 */

import { BackpressureWriteQueue } from './BackpressureWriteQueue';
import { LatencyHistogram } from './metrics';
import { StreamMultiplexer } from './StreamMultiplexer';
import { StreamHandle, StreamScheduler } from './StreamScheduler';
import {
  ByteSink,
  DrainTimeoutError,
  ITransportAdapter,
  TransportClock,
  TransportClosedError,
  TransportMetricsSnapshot,
  SystemTransportClock,
  WriteQueueOptions,
  StreamSchedulerOptions,
} from './types';
import { TransportError } from '../utils/TransportError';

export interface TransportEngineOptions {
  readonly clock?: TransportClock;
  readonly queue: WriteQueueOptions;
  readonly scheduler?: StreamSchedulerOptions;
  /** Max ms to drain in-flight writes on shutdown. Default 5000. */
  readonly drainTimeoutMs?: number;
  readonly histogramCapacity?: number;
}

export interface CollectingSink extends ByteSink {
  /** All bytes received so far, concatenated. */
  collected(): Uint8Array;
}

/**
 * Simple in-memory sink that accepts everything and records it — the
 * default bottom of the stack for stubs/tests.
 */
export class CollectingByteSink implements CollectingSink {
  private readonly _parts: Uint8Array[] = [];
  private _writable = true;
  private _closed = false;
  private _drainCbs: (() => void)[] = [];

  write(chunk: Uint8Array): boolean {
    if (this._closed) {
      throw new TransportClosedError('collecting-sink');
    }
    this._parts.push(chunk.slice());
    return this._writable;
  }

  flush(): void {
    // No-op: everything is already materialized.
  }

  end(): void {
    this._closed = true;
  }

  onDrain(cb: () => void): void {
    this._drainCbs.push(cb);
  }

  get closed(): boolean {
    return this._closed;
  }

  /** Test hook: make the sink refuse subsequent writes. */
  pause(): void {
    this._writable = false;
  }

  /** Test hook: resume + fire drain callbacks. */
  resume(): void {
    this._writable = true;
    const cbs = this._drainCbs.splice(0);
    for (const cb of cbs) {
      cb();
    }
  }

  collected(): Uint8Array {
    const total = this._parts.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of this._parts) {
      out.set(p, off);
      off += p.byteLength;
    }
    return out;
  }

  collectedText(): string {
    return new TextDecoder().decode(this.collected());
  }
}

export class TransportEngine {
  private readonly _adapter: ITransportAdapter;
  private readonly _queue: BackpressureWriteQueue;
  private readonly _scheduler: StreamScheduler;
  private readonly _clock: TransportClock;
  private readonly _drainTimeoutMs: number;
  private readonly _latency: LatencyHistogram;

  private readonly _startedAt: number;
  private _bytesIn: number;
  private _writes: number;
  private _flushes: number;
  private _shutdown: boolean;
  private _shutdownPromise: Promise<void> | null;
  private _openStreams: number;

  constructor(adapter: ITransportAdapter, options: TransportEngineOptions) {
    this._adapter = adapter;
    this._clock = options.clock ?? new SystemTransportClock();
    this._drainTimeoutMs = options.drainTimeoutMs ?? 5000;
    this._queue = new BackpressureWriteQueue(adapter, options.queue);
    this._scheduler = new StreamScheduler(this._queue, options.scheduler ?? {});
    this._latency = new LatencyHistogram(options.histogramCapacity ?? 4096);
    this._startedAt = this._clock.now();
    this._bytesIn = 0;
    this._writes = 0;
    this._flushes = 0;
    this._shutdown = false;
    this._shutdownPromise = null;
    this._openStreams = 0;
  }

  get adapter(): ITransportAdapter {
    return this._adapter;
  }

  get queue(): BackpressureWriteQueue {
    return this._queue;
  }

  get scheduler(): StreamScheduler {
    return this._scheduler;
  }

  get isShutdown(): boolean {
    return this._shutdown;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  start(): void {
    this._adapter.start();
  }

  /* ---------------------------------------------------------------- */
  /* Writing                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Write one chunk. Latency is measured around the adapter hand-off
   * (queue-time included when paused).
   * Returns the queue's `backpressured` flag so callers can react.
   */
  async send(chunk: Uint8Array | string): Promise<boolean> {
    this._ensureRunning();
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    const start = this._clock.now();
    const { result, flushed } = this._queue.enqueue(bytes);
    this._writes++;
    await flushed;
    this._latency.record(this._clock.now() - start);
    return !result.backpressured;
  }

  /** Stream a large payload in scheduled slices. */
  stream(payload: Uint8Array | string): StreamHandle {
    this._ensureRunning();
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const start = this._clock.now();
    const handle = this._scheduler.stream(bytes);
    this._writes++;
    void handle.done.then(() => this._latency.record(this._clock.now() - start));
    return handle;
  }

  /**
   * Create a multiplexer over a ByteSink view of this engine's queue.
   * Each mux record goes through the backpressure-aware queue.
   */
  createMultiplexer(): StreamMultiplexer {
    this._ensureRunning();
    const sink: ByteSink = {
      write: (chunk: Uint8Array) => {
        const { result } = this._queue.enqueue(chunk);
        return !result.backpressured;
      },
      onDrain: (cb: () => void) => this._queue.onDrain(cb),
      get closed() {
        return false;
      },
    };
    const mux = new StreamMultiplexer(sink);
    // Track open-stream metric via a thin wrapper on open/close.
    const originalOpen = mux.openStream.bind(mux);
    mux.openStream = () => {
      this._openStreams++;
      return originalOpen();
    };
    const originalClose = mux.closeStream.bind(mux);
    mux.closeStream = (id) => {
      this._openStreams = Math.max(0, this._openStreams - 1);
      originalClose(id);
    };
    return mux;
  }

  /** Feed inbound bytes (counted for metrics, then handed to `onBytes`). */
  receive(bytes: Uint8Array, onBytes?: (b: Uint8Array) => void): void {
    this._bytesIn += bytes.byteLength;
    onBytes?.(bytes);
  }

  /* ---------------------------------------------------------------- */
  /* Shutdown                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Graceful shutdown: stop accepting writes, drain the queue, then
   * end the adapter (with trailers if the adapter supports them).
   *
   * @param trailers   forwarded to `adapter.end` (HTTP chunked only)
   * @param timeoutMs  override for the drain timeout
   * @throws DrainTimeoutError when pending writes exceed the deadline
   */
  async shutdown(
    trailers?: Record<string, string>,
    timeoutMs?: number
  ): Promise<void> {
    if (this._shutdownPromise) {
      return this._shutdownPromise;
    }
    const deadline = timeoutMs ?? this._drainTimeoutMs;
    this._shutdownPromise = (async () => {
      this._queue.end(); // stop accepting new writes
      const pending = this._queue.queuedBytes;
      if (pending > 0 || this._queue.pendingChunks > 0 || this._queue.paused) {
        await this._waitForDrainWithTimeout(deadline);
      }
      try {
        this._adapter.end(trailers);
      } catch (err) {
        // Adapter may already be aborted; that's a valid end-state.
        if (!(err instanceof TransportError)) {
          throw err;
        }
      }
      this._shutdown = true;
    })();
    return this._shutdownPromise;
  }

  /** Immediate abort — no drain. */
  abort(reason?: string): void {
    this._queue.rejectAll(new TransportError('ABORTED', reason ?? 'aborted', 500));
    this._adapter.abort(reason);
    this._shutdown = true;
    if (!this._shutdownPromise) {
      this._shutdownPromise = Promise.resolve();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Metrics                                                           */
  /* ---------------------------------------------------------------- */

  metrics(): TransportMetricsSnapshot {
    return {
      bytesIn: this._bytesIn,
      bytesOut: this._adapter.bytesWritten,
      writes: this._writes,
      flushes: this._flushes,
      backpressurePauses: this._queue.pauseCount,
      writeLatency: this._latency.snapshot(),
      openStreams: this._openStreams,
      uptimeMs: this._clock.now() - this._startedAt,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _ensureRunning(): void {
    if (this._shutdown || !this._adapter.open) {
      throw new TransportClosedError(this._adapter.name);
    }
  }

  private async _waitForDrainWithTimeout(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_res, rej) => {
      timer = setTimeout(
        () => rej(new DrainTimeoutError(this._queue.queuedBytes, timeoutMs)),
        timeoutMs
      );
    });
    try {
      await Promise.race([this._queue.waitForDrain(), timeout]);
    } catch (err) {
      // Drain failed — reject pending writes and abort the adapter so
      // the engine reaches a closed state instead of wedging.
      this._queue.rejectAll(err);
      this._adapter.abort('drain timeout');
      throw err;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
