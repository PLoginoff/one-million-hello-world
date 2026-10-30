/**
 * BatchFacade — one call → N operations, partial failure tolerated.
 *
 * Amortizes a facade call over a batch of items: `batch(items, op)`
 * executes `op(item)` for each element and returns *per-item* outcomes.
 * Unlike `Promise.all` (fails fast, loses every result on one failure)
 * or `Promise.allSettled` (no concurrency bound, no ordering helpers),
 * this facade:
 *
 *   - bounds concurrency (`maxConcurrency`) so a 10k-item batch can't
 *     open 10k sockets;
 *   - preserves item→result correlation by *index*, not by completion
 *     order — result[i] always corresponds to items[i];
 *   - collects errors per item instead of rejecting the batch;
 *   - optionally chunks items (`chunkSize`) so the underlying op can
 *     still be single-item while callers submit large batches;
 *   - reports `succeeded`/`failed`/`skipped` and a `firstErrorIndex`.
 *
 * `tryAll` vs `batch`: `batch` is the all-independent case. `tryAll`
 * stops early on the first failure when `abortOnError` is set — the
 * "transaction-ish" path for callers who need fail-fast.
 *
 * Complexity: O(N) calls; wall-clock ≈ N/concurrency × per-op latency.
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export interface BatchItemResult<T> {
  index: number;
  ok: boolean;
  value?: T;
  error?: unknown;
}

export interface BatchResult<T> {
  /** One entry per input item, index-aligned. */
  results: BatchItemResult<T>[];
  succeeded: number;
  failed: number;
  /** Items never attempted (abortOnError short-circuit). */
  skipped: number;
  /** Index of the first failing item; `-1` when all succeeded. */
  firstErrorIndex: number;
  durationMs: number;
}

export interface BatchOptions {
  /** Parallel worker count. Default 4. */
  maxConcurrency?: number;
  /** Stop after the first failure (remaining items marked skipped). */
  abortOnError?: boolean;
  clock?: FacadeEngineClock;
}

export class BatchFacade {
  private readonly _clock: FacadeEngineClock;
  private readonly _maxConcurrency: number;
  private readonly _abortOnError: boolean;

  constructor(options: BatchOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxConcurrency = Math.max(1, options.maxConcurrency ?? 4);
    this._abortOnError = options.abortOnError ?? false;
  }

  /**
   * Run `op(item, index)` for every item with bounded concurrency.
   * Never throws — every item gets an outcome entry.
   */
  async batch<I, O>(items: readonly I[], op: (item: I, index: number) => Promise<O> | O, options: { abortOnError?: boolean } = {}): Promise<BatchResult<O>> {
    const started = this._clock.now();
    const abort = options.abortOnError ?? this._abortOnError;
    const results: BatchItemResult<O>[] = new Array(items.length);
    let cursor = 0;
    let aborted = false;
    let firstError = -1;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    const worker = async (): Promise<void> => {
      while (!aborted) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          const v = await op(items[i], i);
          results[i] = { index: i, ok: true, value: v };
          succeeded++;
        } catch (e: unknown) {
          results[i] = { index: i, ok: false, error: e };
          failed++;
          if (firstError < 0) firstError = i;
          if (abort) aborted = true;
        }
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(this._maxConcurrency, items.length); i++) workers.push(worker());
    await Promise.all(workers);

    // Fill in never-attempted slots.
    for (let i = 0; i < items.length; i++) {
      if (results[i] === undefined) {
        results[i] = { index: i, ok: false };
        skipped++;
      }
    }

    return {
      results,
      succeeded,
      failed,
      skipped,
      firstErrorIndex: firstError,
      durationMs: this._clock.now() - started,
    };
  }

  /**
   * Split `items` into chunks of `chunkSize` and run `op` on each chunk.
   * Chunk failures map back to all items in that chunk.
   */
  async batchChunks<I, O>(
    items: readonly I[],
    chunkSize: number,
    op: (chunk: readonly I[], startIndex: number) => Promise<readonly O[]> | readonly O[],
  ): Promise<BatchResult<O>> {
    const size = Math.max(1, chunkSize);
    const chunks: Array<{ items: I[]; start: number }> = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push({ items: items.slice(i, i + size) as I[], start: i });
    }

    const perItem: BatchItemResult<O>[] = new Array(items.length);
    const chunkResult = await this.batch(chunks, async (chunk) => {
      const out = await op(chunk.items, chunk.start);
      return out;
    });

    let succeeded = 0;
    let failed = 0;
    let firstError = -1;
    for (const cr of chunkResult.results) {
      const chunk = chunks[cr.index];
      if (cr.ok && cr.value) {
        for (let j = 0; j < chunk.items.length; j++) {
          perItem[chunk.start + j] = { index: chunk.start + j, ok: true, value: cr.value[j] };
          succeeded++;
        }
      } else {
        for (let j = 0; j < chunk.items.length; j++) {
          perItem[chunk.start + j] = { index: chunk.start + j, ok: false, error: cr.error };
          failed++;
          if (firstError < 0) firstError = chunk.start + j;
        }
      }
    }
    return {
      results: perItem,
      succeeded,
      failed,
      skipped: 0,
      firstErrorIndex: firstError,
      durationMs: chunkResult.durationMs,
    };
  }

  /** Convenience: only the values that succeeded (index order preserved). */
  async collectValues<I, O>(items: readonly I[], op: (item: I, index: number) => Promise<O> | O): Promise<O[]> {
    const r = await this.batch(items, op);
    const out: O[] = [];
    for (const item of r.results) {
      if (item.ok && item.value !== undefined) out.push(item.value);
    }
    return out;
  }
}


