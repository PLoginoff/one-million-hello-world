/**
 * BackpressureWriteQueue — watermark-buffered writer over an adapter.
 *
 * Model: a FIFO of pending chunks with a byte counter. `enqueue` always
 * *tries* to write through to the adapter first (no artificial queueing
 * when writable); only when the adapter says "stop" (returns false →
 * paused) do chunks accumulate. Queued bytes ≥ highWaterMark report
 * `backpressured` to the caller; when draining drops queued bytes below
 * lowWaterMark the queue emits `onDrain` — classic double-threshold
 * hysteresis that avoids thrashing on the boundary.
 *
 * `maxQueuedBytes` gives a hard ceiling: enqueue rejects with
 * {@link QueueFullError} rather than growing unboundedly — this is the
 * difference between *backpressure* (slowing producers) and *buffer
 * bloat* (OOM).
 *
 * Complexity: enqueue/drain are amortized O(1); the queue is a deque
 * implemented as a ring over a growable array.
 *
 * @module TransportLayer/Engine
 */

import {
  EnqueueResult,
  ITransportAdapter,
  QueueFullError,
  TransportClosedError,
  WriteQueueOptions,
} from './types';

interface QueuedChunk {
  readonly bytes: Uint8Array;
  /** Resolve/reject the enqueue's flush-promise when written/failed. */
  readonly resolve: () => void;
  readonly reject: (err: unknown) => void;
}

export class BackpressureWriteQueue {
  private readonly _adapter: ITransportAdapter;
  private readonly _highWaterMark: number;
  private readonly _lowWaterMark: number;
  private readonly _maxQueuedBytes: number | undefined;

  /** Ring buffer of pending chunks. */
  private _ring: (QueuedChunk | undefined)[];
  private _ringHead: number;
  private _ringSize: number;

  private _queuedBytes: number;
  private _paused: boolean; // adapter refused; queue accumulating
  private _drained: boolean; // currently under low watermark → drainable
  private _drainCbs: (() => void)[];
  private _ended: boolean;
  private _totalEnqueued: number;
  private _totalDequeued: number;
  private _pauseCount: number;

  constructor(adapter: ITransportAdapter, options: WriteQueueOptions) {
    if (options.lowWaterMark > options.highWaterMark) {
      throw new RangeError('lowWaterMark must be <= highWaterMark');
    }
    this._adapter = adapter;
    this._highWaterMark = Math.max(1, options.highWaterMark);
    this._lowWaterMark = Math.max(0, options.lowWaterMark);
    this._maxQueuedBytes = options.maxQueuedBytes;

    this._ring = new Array<QueuedChunk | undefined>(8);
    this._ringHead = 0;
    this._ringSize = 0;

    this._queuedBytes = 0;
    this._paused = false;
    this._drained = true;
    this._drainCbs = [];
    this._ended = false;
    this._totalEnqueued = 0;
    this._totalDequeued = 0;
    this._pauseCount = 0;

    // The adapter's drain signal IS the resume event — clear the pause
    // and flush pending chunks FIFO until it refuses again.
    adapter.onDrain(() => {
      this._paused = false;
      this._drain();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Public API                                                        */
  /* ---------------------------------------------------------------- */

  get queuedBytes(): number {
    return this._queuedBytes;
  }

  get pendingChunks(): number {
    return this._ringSize;
  }

  get paused(): boolean {
    return this._paused;
  }

  get pauseCount(): number {
    return this._pauseCount;
  }

  get totalEnqueuedBytes(): number {
    return this._totalEnqueued;
  }

  get totalDequeuedBytes(): number {
    return this._totalDequeued;
  }

  /**
   * Offer a chunk. When the adapter is writable it goes straight
   * through; otherwise it's queued FIFO and drained when the adapter
   * resumes. The returned promise resolves when the chunk's bytes have
   * been handed to the adapter (not merely queued).
   */
  enqueue(chunk: Uint8Array): {
    result: EnqueueResult;
    flushed: Promise<void>;
  } {
    if (this._ended) {
      throw new TransportClosedError(this._adapter.name);
    }
    if (
      this._maxQueuedBytes !== undefined &&
      this._queuedBytes + chunk.byteLength > this._maxQueuedBytes &&
      this._paused
    ) {
      throw new QueueFullError(this._queuedBytes, this._maxQueuedBytes);
    }

    let resolveFn!: () => void;
    let rejectFn!: (err: unknown) => void;
    const flushed = new Promise<void>((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });

    // Fast path: writable adapter + empty queue → write through.
    // The chunk IS handed to the adapter here; a refusal affects only
    // subsequent writes (sets `_paused`), never re-queues this chunk.
    if (!this._paused && this._ringSize === 0) {
      this._writeThrough(chunk, resolveFn, rejectFn);
      return {
        result: {
          accepted: true,
          backpressured: this._paused || this._queuedBytes >= this._highWaterMark,
          queuedBytes: this._queuedBytes,
        },
        flushed,
      };
    }

    this._push({ bytes: chunk, resolve: resolveFn, reject: rejectFn });
    this._queuedBytes += chunk.byteLength;
    this._totalEnqueued += chunk.byteLength;
    this._updateBackpressure();
    return {
      result: {
        accepted: true,
        backpressured: this._queuedBytes >= this._highWaterMark,
        queuedBytes: this._queuedBytes,
      },
      flushed,
    };
  }

  /**
   * Wait until every queued chunk has reached the adapter AND the
   * adapter is writable. Resolves only via a real drain signal — a
   * permanently refused adapter leaves this pending (callers wanting
   * a deadline race it themselves, see the engine's shutdown).
   */
  async waitForDrain(): Promise<void> {
    if (this._ringSize === 0 && !this._paused) {
      return;
    }
    await new Promise<void>((resolve) => {
      this._drainCbs.push(resolve);
      // If not paused, a speculative flush is safe — pending chunks can
      // still go out even without an explicit adapter drain signal.
      if (!this._paused) {
        this._drain();
      }
    });
  }

  /** Register a callback fired when the queue drops below lowWaterMark. */
  onDrain(cb: () => void): void {
    this._drainCbs.push(cb);
  }

  /** Reject all pending chunks (shutdown path). */
  rejectAll(err: unknown): void {
    while (this._ringSize > 0) {
      const c = this._pop();
      c?.reject(err);
    }
    this._queuedBytes = 0;
    this._ended = true;
  }

  end(): void {
    this._ended = true;
  }

  get ended(): boolean {
    return this._ended;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Hand a chunk straight to the adapter (queue empty, not paused).
   * A `false` return marks the queue paused for *subsequent* writes —
   * this chunk was already accepted by the adapter.
   */
  private _writeThrough(
    chunk: Uint8Array,
    resolve: () => void,
    reject: (err: unknown) => void
  ): void {
    try {
      const writable = this._adapter.write(chunk);
      this._totalEnqueued += chunk.byteLength;
      this._totalDequeued += chunk.byteLength;
      resolve();
      if (!writable) {
        this._paused = true;
        this._pauseCount++;
        this._drained = false;
      }
    } catch (err) {
      reject(err); // error consumed by the promise; don't re-throw
    }
  }

  /**
   * Flush queued chunks until the adapter pauses again or the queue
   * empties. Never clears `_paused` by itself — pause is only lifted
   * by the adapter's drain signal (see constructor).
   */
  private _drain(): void {
    while (this._ringSize > 0 && !this._paused) {
      const c = this._ring[this._ringHead];
      if (!c) {
        break;
      }
      try {
        const writable = this._adapter.write(c.bytes);
        this._queuedBytes -= c.bytes.byteLength;
        this._totalDequeued += c.bytes.byteLength;
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
        // Adapter threw — keep draining remaining chunks to their
        // reject handlers rather than wedging the queue.
      }
    }
    this._updateBackpressure();
    if (this._ringSize === 0 && !this._paused) {
      const cbs = this._drainCbs.splice(0);
      for (const cb of cbs) {
        cb();
      }
    }
  }

  private _updateBackpressure(): void {
    if (!this._drained && this._queuedBytes < this._lowWaterMark) {
      this._drained = true;
      const cbs = this._drainCbs.splice(0);
      for (const cb of cbs) {
        cb();
      }
    } else if (this._drained && this._queuedBytes >= this._highWaterMark) {
      this._drained = false;
    }
  }

  /* --------------------------- ring buffer ------------------------ */

  private _push(c: QueuedChunk): void {
    if (this._ringSize === this._ring.length) {
      this._grow();
    }
    const idx = (this._ringHead + this._ringSize) % this._ring.length;
    this._ring[idx] = c;
    this._ringSize++;
  }

  private _pop(): QueuedChunk | undefined {
    if (this._ringSize === 0) {
      return undefined;
    }
    const c = this._ring[this._ringHead];
    this._ring[this._ringHead] = undefined;
    this._ringHead = (this._ringHead + 1) % this._ring.length;
    this._ringSize--;
    return c;
  }

  private _grow(): void {
    const next = new Array<QueuedChunk | undefined>(this._ring.length * 2);
    for (let i = 0; i < this._ringSize; i++) {
      next[i] = this._ring[(this._ringHead + i) % this._ring.length];
    }
    this._ring = next;
    this._ringHead = 0;
  }
}
