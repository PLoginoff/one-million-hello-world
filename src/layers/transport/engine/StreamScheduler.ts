/**
 * StreamScheduler — cooperative chunking of large streaming payloads.
 *
 * A naive `for (chunk of payload) queue.enqueue(chunk)` loop monopolizes
 * the event loop for large bodies and ignores backpressure between
 * chunks. The scheduler instead emits at most `chunksPerTick` chunks
 * per scheduling quantum and waits for queue drain when the queue is
 * over its high water mark — interleaving with other work and never
 * overrunning the transport.
 *
 * Cancellation: `stream()` returns a handle with `cancel()`; pending
 * scheduled ticks check the flag before emitting so a cancelled stream
 * stops within one quantum.
 *
 * @module TransportLayer/Engine
 */

import { BackpressureWriteQueue } from './BackpressureWriteQueue';
import { StreamSchedulerOptions } from './types';

export interface StreamHandle {
  /** Resolves when all chunks were flushed to the queue, or rejects. */
  readonly done: Promise<StreamResult>;
  /** Stop scheduling further chunks. Already-written bytes stay. */
  cancel(reason?: string): void;
  /** True after cancel() or completion. */
  readonly finished: boolean;
}

export interface StreamResult {
  readonly chunksWritten: number;
  readonly bytesWritten: number;
  readonly cancelled: boolean;
  readonly cancelReason?: string;
}

const defaultSchedule = (fn: () => void): void => {
  // setImmediate in Node/Bun; falls back to setTimeout(0) elsewhere.
  const g = globalThis as { setImmediate?: (f: () => void) => void };
  if (typeof g.setImmediate === 'function') {
    g.setImmediate(fn);
  } else {
    setTimeout(fn, 0);
  }
};

/**
 * Slice a large payload into `chunkSize` pieces.
 * Returns an empty array for empty payloads (zero chunks — a stream of
 * nothing writes nothing, not even a zero-length frame).
 */
export function sliceChunks(payload: Uint8Array, chunkSize: number): Uint8Array[] {
  const size = Math.max(1, chunkSize);
  const out: Uint8Array[] = [];
  for (let off = 0; off < payload.byteLength; off += size) {
    out.push(payload.subarray(off, Math.min(off + size, payload.byteLength)));
  }
  return out;
}

export class StreamScheduler {
  private readonly _queue: BackpressureWriteQueue;
  private readonly _chunkSize: number;
  private readonly _chunksPerTick: number;
  private readonly _schedule: (fn: () => void) => void;

  constructor(queue: BackpressureWriteQueue, options: StreamSchedulerOptions = {}) {
    this._queue = queue;
    this._chunkSize = Math.max(1, options.chunkSize ?? 16 * 1024);
    this._chunksPerTick = Math.max(1, options.chunksPerTick ?? 4);
    this._schedule = options.schedule ?? defaultSchedule;
  }

  /**
   * Stream `payload` through the write queue in scheduled slices.
   *
   * @param payload   bytes to send
   * @param transform optional per-chunk transform (e.g. wrap in a mux
   *                  frame) applied before enqueue
   */
  stream(
    payload: Uint8Array,
    transform?: (chunk: Uint8Array, index: number) => Uint8Array
  ): StreamHandle {
    const chunks = sliceChunks(payload, this._chunkSize);
    let cancelled = false;
    let cancelReason: string | undefined;
    let finished = false;
    let idx = 0;
    let bytesWritten = 0;

    const done = new Promise<StreamResult>((resolve, reject) => {
      const tick = (): void => {
        if (cancelled) {
          finished = true;
          resolve({
            chunksWritten: idx,
            bytesWritten,
            cancelled: true,
            cancelReason,
          });
          return;
        }
        // Emit up to chunksPerTick chunks, pausing for drain whenever
        // the queue reports backpressure.
        let emitted = 0;
        while (idx < chunks.length && emitted < this._chunksPerTick) {
          const raw = chunks[idx] as Uint8Array;
          const out = transform ? transform(raw, idx) : raw;
          try {
            const { result } = this._queue.enqueue(out);
            idx++;
            emitted++;
            bytesWritten += out.byteLength;
            if (result.backpressured) {
              // Wait for drain before the next quantum.
              this._queue.onDrain(() => this._schedule(tick));
              return;
            }
          } catch (err) {
            finished = true;
            reject(err);
            return;
          }
        }
        if (idx < chunks.length) {
          this._schedule(tick);
        } else {
          finished = true;
          resolve({ chunksWritten: idx, bytesWritten, cancelled: false });
        }
      };
      this._schedule(tick);
    });

    return {
      done,
      cancel(reason?: string) {
        if (!finished) {
          cancelled = true;
          cancelReason = reason ?? 'cancelled';
        }
      },
      get finished() {
        return finished;
      },
    };
  }

  /** Convenience: stream an async iterable of pre-chunked payloads. */
  streamChunks(
    chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>
  ): StreamHandle {
    let cancelled = false;
    let cancelReason: string | undefined;
    let finished = false;
    let count = 0;
    let bytes = 0;

    const done = (async (): Promise<StreamResult> => {
      for await (const chunk of chunks) {
        if (cancelled) {
          break;
        }
        const { result, flushed } = this._queue.enqueue(chunk);
        count++;
        bytes += chunk.byteLength;
        if (result.backpressured) {
          await this._queue.waitForDrain();
        }
        await flushed.catch(() => undefined);
      }
      finished = true;
      return {
        chunksWritten: count,
        bytesWritten: bytes,
        cancelled,
        cancelReason,
      };
    })();

    return {
      done,
      cancel(reason?: string) {
        if (!finished) {
          cancelled = true;
          cancelReason = reason ?? 'cancelled';
        }
      },
      get finished() {
        return finished;
      },
    };
  }
}
