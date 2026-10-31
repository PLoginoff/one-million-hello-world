/**
 * Request Streamer — bounded-buffer body streaming with backpressure.
 *
 * Models a `Transfer-Encoding: chunked` request body as a bounded
 * byte queue between producer (transport) and consumer (handler):
 *
 *   producer ──push()──► [ ring buffer ≤ capacity ] ──pull()──► handler
 *
 * Backpressure contract: `push()` NEVER blocks and NEVER drops. When
 * the buffer is at capacity it returns `{kind:'full'}` — the transport
 * layer is responsible for pausing reads (TCP flow control does this
 * naturally once the receive window fills). This mirrors Node's
 * `stream.write() → false` + `'drain'` contract.
 *
 * The buffer is a flat `Uint8Array[]` queue (not a ring over bytes)
 * because chunks arrive in arbitrary sizes and consumers pull whole
 * chunks — byte-level coalescing would add O(n) copying for no gain.
 *
 * @module ControllerLayer/Engine
 */

import {
  BodyChunk,
  ChunkReader,
  ChunkWriter,
  RequestStream,
  StreamStats,
  WriteResult,
} from './streaming-types';

// ---------------------------------------------------------------------------
// Bounded chunk stream
// ---------------------------------------------------------------------------

/** Options for {@link BoundedChunkStream}. */
export interface ChunkStreamOptions {
  /** Buffer capacity in bytes. push() reports 'full' beyond this. */
  readonly capacity: number;
}

/**
 * Bounded FIFO chunk queue.
 *
 * `write` is O(1); `read(n)` is O(chunks-consumed). Memory is bounded
 * by `capacity` — the producer can never force the consumer's heap to
 * grow, which is the entire point of the backpressure contract.
 */
export class BoundedChunkStream implements ChunkReader, ChunkWriter {
  private readonly _capacity: number;
  private _queue: Uint8Array[];
  private _buffered: number;
  private _closed: boolean;
  private _closeListeners: Array<() => void>;

  constructor(options: ChunkStreamOptions) {
    if (options.capacity <= 0) {
      throw new Error('ChunkStream capacity must be > 0');
    }
    this._capacity = options.capacity;
    this._queue = [];
    this._buffered = 0;
    this._closed = false;
    this._closeListeners = [];
  }

  get capacity(): number {
    return this._capacity;
  }

  get buffered(): number {
    return this._buffered;
  }

  get closed(): boolean {
    return this._closed;
  }

  write(chunk: Uint8Array): WriteResult {
    if (this._closed) {
      return { kind: 'closed' };
    }
    if (this._buffered + chunk.length > this._capacity) {
      return { kind: 'full', buffered: this._buffered, capacity: this._capacity };
    }
    this._queue.push(chunk);
    this._buffered += chunk.length;
    return { kind: 'accepted', buffered: this._buffered };
  }

  /**
   * Read at most `maxBytes` worth of queued chunks. A chunk larger
   * than the remaining budget is split — the tail stays queued.
   */
  read(maxBytes: number): Uint8Array[] {
    const out: Uint8Array[] = [];
    let remaining = maxBytes;
    while (remaining > 0 && this._queue.length > 0) {
      const head = this._queue[0];
      if (head.length <= remaining) {
        this._queue.shift();
        this._buffered -= head.length;
        out.push(head);
        remaining -= head.length;
      } else {
        const headPart = head.slice(0, remaining);
        this._queue[0] = head.slice(remaining);
        this._buffered -= remaining;
        out.push(headPart);
        remaining = 0;
      }
    }
    return out;
  }

  drain(): Uint8Array[] {
    const out = this._queue;
    this._queue = [];
    this._buffered = 0;
    return out;
  }

  close(): void {
    if (this._closed) {
      return;
    }
    this._closed = true;
    for (const fn of this._closeListeners) {
      fn();
    }
    this._closeListeners = [];
  }

  onClose(fn: () => void): void {
    if (this._closed) {
      fn();
      return;
    }
    this._closeListeners.push(fn);
  }
}

// ---------------------------------------------------------------------------
// Request stream (decorates the bounded stream with chunk metadata)
// ---------------------------------------------------------------------------

/** Options for {@link createRequestStream}. */
export interface RequestStreamOptions {
  /** Buffer capacity in bytes. */
  readonly capacity: number;
  /** Clock injection — defaults to performance.now/Date.now. */
  readonly now?: () => number;
}

/**
 * Request body stream.
 *
 * Wraps {@link BoundedChunkStream}, tagging each accepted chunk with a
 * sequence index and running byte total for handler-side accounting
 * (progress bars, quota checks).
 */
export class RequestStreamImpl implements RequestStream {
  private readonly _stream: BoundedChunkStream;
  private readonly _pending: BodyChunk[];
  private readonly _now: () => number;
  private readonly _startedMs: number;
  private _index: number;
  private _totalBytes: number;
  private _backpressureEvents: number;
  private _finished: boolean;

  constructor(options: RequestStreamOptions) {
    this._stream = new BoundedChunkStream({ capacity: options.capacity });
    this._pending = [];
    this._now = options.now ?? defaultNow;
    this._startedMs = this._now();
    this._index = 0;
    this._totalBytes = 0;
    this._backpressureEvents = 0;
    this._finished = false;
  }

  get finished(): boolean {
    return this._finished;
  }

  /**
   * Feed a raw chunk through the gate. Full buffers count as
   * backpressure events — transports use them for metrics/autotuning.
   */
  push(chunk: Uint8Array): WriteResult {
    if (this._finished) {
      return { kind: 'closed' };
    }
    const res = this._stream.write(chunk);
    if (res.kind === 'full') {
      this._backpressureEvents += 1;
      return res;
    }
    if (res.kind === 'accepted') {
      this._totalBytes += chunk.length;
      this._pending.push({
        data: chunk,
        index: this._index,
        cumulativeBytes: this._totalBytes,
      });
      this._index += 1;
      // The pending metadata queue mirrors the byte queue — drain it
      // when the consumer pulls, not here.
    }
    return res;
  }

  /**
   * Handler-side pull: consume up to `maxChunks` tagged chunks.
   * Draining the underlying byte stream keeps the two queues in sync.
   */
  pull(maxChunks = Number.POSITIVE_INFINITY): BodyChunk[] {
    const out: BodyChunk[] = [];
    while (out.length < maxChunks && this._pending.length > 0) {
      const chunk = this._pending.shift();
      if (chunk === undefined) {
        break;
      }
      out.push(chunk);
    }
    // Free bytes in the bounded stream for everything consumed.
    if (out.length > 0) {
      const bytes = out.reduce((n, c) => n + c.data.length, 0);
      this._stream.read(bytes);
    }
    return out;
  }

  finish(): void {
    this._finished = true;
    this._stream.close();
  }

  stats(): StreamStats {
    return {
      chunks: this._index,
      totalBytes: this._totalBytes,
      backpressureEvents: this._backpressureEvents,
      durationMs: this._now() - this._startedMs,
    };
  }

  /** Access the underlying bounded stream (transport integration). */
  inner(): BoundedChunkStream {
    return this._stream;
  }
}

/** Factory — matches the codebase's `create*` helper style. */
export function createRequestStream(options: RequestStreamOptions): RequestStream {
  return new RequestStreamImpl(options);
}

// ---------------------------------------------------------------------------
// Chunked-body coalescing helper
// ---------------------------------------------------------------------------

/**
 * Feed a large body through the stream in `chunkSize` slices, honoring
 * backpressure by draining after each 'full' signal. Returns the
 * stats — a realistic simulation of how a transport paces a body.
 */
export function feedBody(
  stream: RequestStream,
  body: Uint8Array,
  chunkSize: number
): { accepted: number; stalled: number } {
  let accepted = 0;
  let stalled = 0;
  for (let off = 0; off < body.length; off += chunkSize) {
    const slice = body.slice(off, Math.min(body.length, off + chunkSize));
    const res = stream.push(slice);
    if (res.kind === 'full') {
      stalled += 1;
      // Consumer must drain before we can retry — pull everything.
      stream.pull();
      const retry = stream.push(slice);
      if (retry.kind === 'accepted') {
        accepted += 1;
      }
    } else if (res.kind === 'accepted') {
      accepted += 1;
    }
  }
  return { accepted, stalled };
}

function defaultNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
