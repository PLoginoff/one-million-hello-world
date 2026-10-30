/**
 * SocketBackpressure — write-side credit gate with high/low watermark
 * hysteresis over a {@link ByteSink}.
 *
 * Model: a FIFO ring of pending chunks plus a byte counter. `write`
 * always *tries* the sink first (no artificial queueing when
 * writable); only when the sink says "stop" (returns `false`) do
 * subsequent chunks queue. Queued bytes >= `highWaterMark` report
 * `backpressured`; when draining drops bytes below `lowWaterMark` the
 * controller fires drain callbacks — double-threshold hysteresis so a
 * producer hovering near the boundary doesn't thrash pause/resume.
 *
 * `maxQueuedBytes` is a hard ceiling: exceeding it throws
 * `QueueFullError` rather than growing unboundedly — the difference
 * between *backpressure* (slowing producers) and *buffer bloat*
 * (OOM'ing the process).
 *
 * Compared to {@link BackpressureWriteQueue} in the transport layer
 * this controller adds: per-chunk flush promises (callers can await
 * *their* write specifically), a separate `drainWaiters` promise queue
 * (wait-for-drain without hooking the event), and a total-bytes
 * counter split across written vs queued so metrics can distinguish
 * "handed to kernel" from "still our problem".
 *
 * Complexity: write/drain are amortized O(1); the pending queue is a
 * ring buffer over a growable array (no `.shift()` O(n)).
 *
 * @module NetworkLayer/Engine
 */

import {
  BackpressureOptions,
  BackpressureWriteResult,
  ByteSink,
} from './types';
import { NetworkError } from '../utils/NetworkError';

export class QueueFullError extends NetworkError {
  constructor(queued: number, max: number) {
    super(
      'BACKPRESSURE_QUEUE_FULL',
      `Write queue full: ${queued} bytes queued (max ${max})`,
      503
    );
    this.name = 'QueueFullError';
  }
}

export class SinkClosedError extends NetworkError {
  constructor() {
    super('SINK_CLOSED', 'Write attempted on a closed sink', 410);
    this.name = 'SinkClosedError';
  }
}

interface PendingChunk {
  readonly bytes: Uint8Array;
  readonly resolve: () => void;
  readonly reject: (err: unknown) => void;
}

export class SocketBackpressure {
  private readonly _sink: ByteSink;
  private readonly _highWaterMark: number;
  private readonly _lowWaterMark: number;
  private readonly _maxQueuedBytes: number | undefined;

  /** Ring buffer of queued chunks. */
  private _ring: (PendingChunk | undefined)[];
  private _head: number;
  private _size: number;

  private _queuedBytes: number;
  private _paused: boolean;      // sink refused — we're accumulating
  private _belowLow: boolean;    // hysteresis state: currently under LWM
  private _drainCbs: (() => void)[];
  private _ended: boolean;

  private _totalWritten: number; // bytes handed to the sink
  private _totalQueued: number;  // bytes that ever hit the queue
  private _pauseCount: number;

  constructor(sink: ByteSink, options: BackpressureOptions) {
    if (options.lowWaterMark > options.highWaterMark) {
      throw new RangeError('lowWaterMark must be <= highWaterMark');
    }
    this._sink = sink;
    this._highWaterMark = Math.max(1, options.highWaterMark);
    this._lowWaterMark = Math.max(0, options.lowWaterMark);
    this._maxQueuedBytes = options.maxQueuedBytes;

    this._ring = new Array<PendingChunk | undefined>(8);
    this._head = 0;
    this._size = 0;

    this._queuedBytes = 0;
    this._paused = false;
    this._belowLow = true;
    this._drainCbs = [];
    this._ended = false;

    this._totalWritten = 0;
    this._totalQueued = 0;
    this._pauseCount = 0;

    // The sink's drain signal IS the resume event — clear the pause
    // and flush pending chunks FIFO until it refuses again.
    sink.onDrain?.(() => {
      this._paused = false;
      this._drain();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  get queuedBytes(): number {
    return this._queuedBytes;
  }

  get pendingChunks(): number {
    return this._size;
  }

  get paused(): boolean {
    return this._paused;
  }

  get pauseCount(): number {
    return this._pauseCount;
  }

  get totalBytesWritten(): number {
    return this._totalWritten;
  }

  get totalBytesQueued(): number {
    return this._totalQueued;
  }

  /* ---------------------------------------------------------------- */
  /* Writes                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Offer a chunk. When the sink is writable it goes straight
   * through; otherwise the chunk queues FIFO and flushes when the
   * sink drains. `flushed` resolves when *this* chunk's bytes reach
   * the sink — not merely when they're queued.
   */
  write(chunk: Uint8Array): BackpressureWriteResult {
    if (this._ended) {
      throw new SinkClosedError();
    }
    if (
      this._maxQueuedBytes !== undefined &&
      this._paused &&
      this._queuedBytes + chunk.byteLength > this._maxQueuedBytes
    ) {
      throw new QueueFullError(this._queuedBytes, this._maxQueuedBytes);
    }

    let resolveFn!: () => void;
    let rejectFn!: (err: unknown) => void;
    const flushed = new Promise<void>((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });

    // Fast path: writable sink + empty queue → write through. The
    // chunk IS handed to the sink here; a `false` return affects only
    // subsequent writes (sets `_paused`), never re-queues this chunk.
    if (!this._paused && this._size === 0) {
      this._writeThrough(chunk, resolveFn, rejectFn);
      return {
        backpressured: this._paused || this._queuedBytes >= this._highWaterMark,
        queuedBytes: this._queuedBytes,
        flushed,
      };
    }

    this._push({ bytes: chunk, resolve: resolveFn, reject: rejectFn });
    this._queuedBytes += chunk.byteLength;
    this._totalQueued += chunk.byteLength;
    this._updateHysteresis();

    return {
      backpressured: this._queuedBytes >= this._highWaterMark,
      queuedBytes: this._queuedBytes,
      flushed,
    };
  }

  /**
   * Wait until every queued chunk has reached the sink AND the sink
   * is writable. Resolves only via a real drain — a permanently
   * refused sink leaves this pending (callers race a timeout
   * themselves if they need one).
   */
  async waitForDrain(): Promise<void> {
    if (this._size === 0 && !this._paused) {
      return;
    }
    await new Promise<void>((resolve) => {
      this._drainCbs.push(resolve);
      if (!this._paused) {
        this._drain(); // speculative flush is safe when not paused
      }
    });
  }

  /** Register a callback fired when the queue drops below lowWaterMark. */
  onDrain(cb: () => void): void {
    this._drainCbs.push(cb);
  }

  /** Reject all pending chunks (shutdown path). */
  rejectAll(err: unknown): void {
    while (this._size > 0) {
      const c = this._pop();
      c?.reject(err);
    }
    this._queuedBytes = 0;
    this._ended = true;
  }

  end(): void {
    this._ended = true;
    this._sink.end?.();
  }

  get ended(): boolean {
    return this._ended;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Hand a chunk straight to the sink (queue empty, not paused). A
   * `false` return marks the controller paused for *subsequent*
   * writes — this chunk was already accepted by the sink.
   */
  private _writeThrough(
    chunk: Uint8Array,
    resolve: () => void,
    reject: (err: unknown) => void
  ): void {
    try {
      const writable = this._sink.write(chunk);
      this._totalWritten += chunk.byteLength;
      resolve();
      if (!writable) {
        this._paused = true;
        this._pauseCount++;
        this._belowLow = false;
      }
    } catch (err) {
      reject(err); // consumed by the promise; don't re-throw
    }
  }

  /**
   * Flush queued chunks until the sink pauses again or the queue
   * empties. Never clears `_paused` itself — pause only lifts via the
   * sink's drain signal (see constructor).
   */
  private _drain(): void {
    while (this._size > 0 && !this._paused) {
      const c = this._ring[this._head];
      if (!c) {
        break;
      }
      try {
        const writable = this._sink.write(c.bytes);
        this._queuedBytes -= c.bytes.byteLength;
        this._totalWritten += c.bytes.byteLength;
        this._pop();
        c.resolve();
        if (!writable) {
          this._paused = true;
          this._pauseCount++;
          break;
        }
      } catch (err) {
        this._queuedBytes -= c.bytes.byteLength;
        this._pop();
        c.reject(err);
        // Sink threw — keep draining remaining chunks to their reject
        // handlers rather than wedging the queue.
      }
    }
    this._updateHysteresis();
    if (this._size === 0 && !this._paused) {
      const cbs = this._drainCbs.splice(0);
      for (const cb of cbs) {
        cb();
      }
    }
  }

  /**
   * Double-threshold bookkeeping: dropping *below* lowWaterMark (not
   * merely below highWaterMark) is what signals "producers may
   * resume". Without the second threshold a writer adding exactly one
   * chunk would flip backpressured on every write/drain pair.
   */
  private _updateHysteresis(): void {
    if (!this._belowLow && this._queuedBytes <= this._lowWaterMark) {
      this._belowLow = true;
      const cbs = this._drainCbs.splice(0);
      for (const cb of cbs) {
        cb();
      }
    } else if (this._belowLow && this._queuedBytes >= this._highWaterMark) {
      this._belowLow = false;
    }
  }

  /* --------------------------- ring buffer ------------------------ */

  private _push(c: PendingChunk): void {
    if (this._size === this._ring.length) {
      this._grow();
    }
    const idx = (this._head + this._size) % this._ring.length;
    this._ring[idx] = c;
    this._size++;
  }

  private _pop(): PendingChunk | undefined {
    if (this._size === 0) {
      return undefined;
    }
    const c = this._ring[this._head];
    this._ring[this._head] = undefined;
    this._head = (this._head + 1) % this._ring.length;
    this._size--;
    return c;
  }

  private _grow(): void {
    const next = new Array<PendingChunk | undefined>(this._ring.length * 2);
    for (let i = 0; i < this._size; i++) {
      next[i] = this._ring[(this._head + i) % this._ring.length];
    }
    this._ring = next;
    this._head = 0;
  }
}
