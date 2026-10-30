/**
 * Transport Engine — shared types.
 *
 * Vocabulary:
 * - `ByteSink`      — the thing at the bottom: accepts bytes, reports
 *                     immediate acceptance, receives flush/end signals.
 * - `ITransportAdapter` — a byte-oriented transport (loopback, socket
 *                     stub, HTTP chunked writer, SSE, WebSocket frames).
 * - `BackpressureWriteQueue` — credit/watermark-buffered writer on top
 *                     of a sink.
 * - `StreamScheduler` — splits large payloads into scheduled chunks.
 * - `StreamMultiplexer` — many logical streams over one transport.
 * - `TransportEngine` — facade + graceful shutdown + metrics.
 *
 * All byte buffers are `Uint8Array` (works in Bun, Node, browsers); the
 * ws FrameCodec interops via `Buffer.from(u8)` at the adapter boundary.
 *
 * @module TransportLayer/Engine
 */

import { TransportError } from '../utils/TransportError';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface TransportClock {
  /** Milliseconds since an arbitrary epoch; must be monotonic. */
  now(): number;
}

export class SystemTransportClock implements TransportClock {
  now(): number {
    return Date.now();
  }
}

/* ------------------------------------------------------------------ */
/* Byte sink                                                           */
/* ------------------------------------------------------------------ */

/**
 * Terminal consumer of bytes. `write` returns `true` when the sink
 * absorbed the chunk immediately (still writable), `false` when the
 * caller should hold off until {@link onDrain} fires — the classic
 * Node writable-stream contract, kept minimal.
 */
export interface ByteSink {
  write(chunk: Uint8Array): boolean;
  /** Optional hint that a burst of writes finished (segment boundary). */
  flush?(): void;
  /** Half-close: no more writes; sink may still drain buffered bytes. */
  end?(): void;
  /**
   * Register a drain callback invoked when the sink becomes writable
   * again after returning `false`. Multiple registrations fire FIFO.
   */
  onDrain?(cb: () => void): void;
  /** Sink is closed/finished — further writes are rejected. */
  readonly closed: boolean;
}

/* ------------------------------------------------------------------ */
/* Transport adapters                                                  */
/* ------------------------------------------------------------------ */

/**
 * A pluggable byte transport. Adapters translate the transport-neutral
 * `send`/`stream` calls into wire formats (raw bytes, chunked HTTP,
 * SSE, WS frames) and report I/O upward through a `ByteSink`-shaped
 * API so the engine can layer backpressure uniformly.
 */
export interface ITransportAdapter {
  readonly name: string;
  /** True once `open` has been called and `close`/`fail` haven't. */
  readonly open: boolean;
  /** Raw bytes produced so far (post-encoding), for tests + metrics. */
  readonly bytesWritten: number;

  /** Establish the transport (connect/handshake — stubs are instant). */
  start(): void;
  /**
   * Encode + emit one chunk. Returns false if the adapter's internal
   * buffer is at capacity — callers then wait for `onDrain`.
   */
  write(chunk: Uint8Array): boolean;
  /**
   * Flush + optionally half-close. After `end`, `write` throws.
   */
  end(trailers?: Record<string, string>): void;
  /** Abort ungracefully; buffered bytes may be discarded. */
  abort(reason?: string): void;
  /** Called when the adapter becomes writable after a `false`. */
  onDrain(cb: () => void): void;
}

/* ------------------------------------------------------------------ */
/* Backpressure                                                        */
/* ------------------------------------------------------------------ */

export interface WriteQueueOptions {
  /** Bytes at which writers are asked to pause (write returns false). */
  readonly highWaterMark: number;
  /** Bytes below which a paused queue resumes + fires drain. */
  readonly lowWaterMark: number;
  /**
   * Soft cap on *queued* bytes (not yet handed to the sink). When the
   * queue is full, `enqueue` rejects with QUEUE_FULL instead of growing
   * without bound. `undefined` = unbounded.
   */
  readonly maxQueuedBytes?: number;
}

export interface EnqueueResult {
  /** Whether the chunk was accepted into the queue. */
  readonly accepted: boolean;
  /** Whether the caller should pause (queue at/over high water mark). */
  readonly backpressured: boolean;
  /** Total bytes currently queued (post-operation). */
  readonly queuedBytes: number;
}

/* ------------------------------------------------------------------ */
/* Streaming                                                           */
/* ------------------------------------------------------------------ */

export interface StreamSchedulerOptions {
  /** Bytes per emitted chunk. Default 16 KiB. */
  readonly chunkSize?: number;
  /** Scheduling quantum between chunks; 0 = all in one macrotask. */
  readonly chunksPerTick?: number;
  /** Injectable scheduler; defaults to setImmediate/setTimeout(0). */
  readonly schedule?: (fn: () => void) => void;
}

/* ------------------------------------------------------------------ */
/* Multiplexing                                                        */
/* ------------------------------------------------------------------ */

/** Logical stream identifier within a multiplexed connection. */
export type StreamId = number;

/**
 * Wire framing for the stub multiplexer: a fixed 8-byte header
 * [u32 streamId][u8 flags][u24 length] + payload.
 * flags: 0x1 = OPEN, 0x2 = END, 0x4 = RST.
 */
export const enum MuxFlag {
  OPEN = 0x1,
  END = 0x2,
  RST = 0x4,
}
export const MUX_HEADER_BYTES = 8;

/** Decoded mux record delivered to the demuxer callback. */
export interface MuxRecord {
  readonly streamId: StreamId;
  readonly flags: number;
  readonly payload: Uint8Array;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export interface LatencySnapshot {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p90: number;
  readonly p99: number;
}

export interface TransportMetricsSnapshot {
  readonly bytesIn: number;
  readonly bytesOut: number;
  readonly writes: number;
  readonly flushes: number;
  readonly backpressurePauses: number;
  readonly writeLatency: LatencySnapshot;
  readonly openStreams: number;
  readonly uptimeMs: number;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class QueueFullError extends TransportError {
  constructor(queuedBytes: number, maxQueuedBytes: number) {
    super(
      'QUEUE_FULL',
      `Write queue full: ${queuedBytes} bytes queued (max ${maxQueuedBytes})`,
      503
    );
    this.name = 'QueueFullError';
  }
}

export class TransportClosedError extends TransportError {
  constructor(adapter: string) {
    super('CLOSED', `Transport '${adapter}' is closed`, 410);
    this.name = 'TransportClosedError';
  }
}

export class DrainTimeoutError extends TransportError {
  constructor(pendingBytes: number, timeoutMs: number) {
    super(
      'DRAIN_TIMEOUT',
      `Graceful shutdown timed out with ${pendingBytes} bytes pending after ${timeoutMs}ms`,
      500
    );
    this.name = 'DrainTimeoutError';
  }
}
