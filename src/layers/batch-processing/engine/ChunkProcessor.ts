/**
 * Chunk Processor
 *
 * Runs one partition of a job: read chunk -> process each item ->
 * write chunk -> commit checkpoint. Repeats until EOF or range end.
 *
 * Semantics:
 *  - Items are read in `chunkSize` blocks starting at a resume offset
 *    (from the checkpoint store on restart).
 *  - Each item passes through the processor. A throwing processor
 *    counts against the skip policy; skipped items are logged to the
 *    skippers log and NOT written.
 *  - If a non-skippable item fails, or the writer throws, the chunk
 *    is retried up to `retry.maxAttempts` with exponential backoff.
 *    The reader must be re-readable for this to be safe.
 *  - After a successful write, a checkpoint is saved — restart resumes
 *    at the next uncommitted offset.
 *
 * EOF: for unbounded ranges, a read returning fewer items than
 * requested (including zero) ends the partition.
 *
 * @module BatchProcessingLayer/Engine
 */

import {
  BatchJob,
  Checkpoint,
  CheckpointStore,
  ChunkFailedError,
  JobListener,
  PartitionStats,
  RetryPolicy,
  SkipLimitExceededError,
  SkipPolicy,
  BatchClock,
  SystemBatchClock,
} from './types';
import { SkippersLog, payloadPreview } from './Checkpointing';

const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 100,
  backoffMultiplier: 2,
  maxBackoffMs: 10_000,
};

const DEFAULT_SKIP: SkipPolicy = { maxSkips: 0 };

export interface ChunkProcessorDeps {
  readonly checkpointStore: CheckpointStore;
  readonly skippers: SkippersLog;
  readonly clock?: BatchClock;
  readonly listeners?: readonly JobListener[];
}

/** Outcome of running one partition. */
export interface PartitionResult {
  readonly stats: PartitionStats;
  /** Last committed checkpoint. */
  readonly checkpoint: Checkpoint;
  /** True when the partition reached EOF/range end, false when it stopped early. */
  readonly drained: boolean;
}

export class ChunkProcessor {
  private _store: CheckpointStore;
  private _skippers: SkippersLog;
  private _clock: BatchClock;
  private _listeners: readonly JobListener[];

  constructor(deps: ChunkProcessorDeps) {
    this._store = deps.checkpointStore;
    this._skippers = deps.skippers;
    this._clock = deps.clock ?? new SystemBatchClock();
    this._listeners = deps.listeners ?? [];
  }

  /**
   * Run partition `partition` of `job` to completion.
   *
   * @param itemRange  [start, end) global item indexes this partition
   *                   owns; undefined end = until reader EOF.
   */
  async run<I, O>(
    job: BatchJob<I, O>,
    partition: number,
    itemRange: { start: number; end?: number }
  ): Promise<PartitionResult> {
    const started = this._clock.now();
    const retry = job.retry ?? DEFAULT_RETRY;
    const skip = job.skip ?? DEFAULT_SKIP;
    const prior = await this._store.load(job.id, partition);

    let offset = Math.max(itemRange.start, prior?.committedOffset ?? itemRange.start);
    let chunksCommitted = prior?.chunksCompleted ?? 0;
    let skipped = prior?.skippedCount ?? 0;
    let itemsRead = 0;
    let itemsWritten = 0;
    let chunkRetries = 0;
    let chunkIndex = chunksCommitted;
    let eof = false;

    while (!eof) {
      if (itemRange.end !== undefined && offset >= itemRange.end) {
        eof = true;
        break;
      }
      const want = Math.min(
        job.chunkSize,
        itemRange.end !== undefined ? itemRange.end - offset : job.chunkSize
      );

      // ---------- one chunk, retried as a unit ----------
      let attempt = 0;
      let lastError: Error | undefined;
      let done = false;

      while (!done) {
        attempt++;
        try {
          const raw = await job.reader.read(offset, want);
          if (raw.length === 0) {
            eof = true;
            done = true;
            break;
          }
          itemsRead += raw.length;

          const processed: O[] = [];
          let chunkSkips = 0;
          for (let i = 0; i < raw.length; i++) {
            const index = offset + i;
            try {
              processed.push(await job.processor.process(raw[i]!, index));
            } catch (err) {
              const e = err instanceof Error ? err : new Error(String(err));
              if (skip.skippable && !skip.skippable(e)) throw e;
              if (
                skip.maxSkipsPerChunk !== undefined &&
                chunkSkips >= skip.maxSkipsPerChunk
              ) {
                throw new SkipLimitExceededError(chunkSkips + 1, skip.maxSkipsPerChunk);
              }
              if (skipped >= skip.maxSkips) {
                throw new SkipLimitExceededError(skipped + 1, skip.maxSkips);
              }
              skipped++;
              chunkSkips++;
              this._skippers.record({
                jobId: job.id,
                partition,
                index,
                errorMessage: e.message,
                errorName: e.name,
                payloadPreview: payloadPreview(raw[i]),
                timestamp: this._clock.now(),
              });
              for (const l of this._listeners) l.onItemSkipped?.(partition, index, e);
            }
          }

          await job.writer.write(processed, chunkIndex);
          offset += raw.length;
          chunksCommitted++;
          itemsWritten += processed.length;
          if (raw.length < want) eof = true; // short read = EOF

          const checkpoint: Checkpoint = {
            committedOffset: offset,
            chunksCompleted: chunksCommitted,
            skippedCount: skipped,
            timestamp: this._clock.now(),
          };
          await this._store.save(job.id, partition, checkpoint);
          chunkIndex++;
          for (const l of this._listeners) {
            l.onChunkCommitted?.(partition, chunkIndex - 1, processed.length);
          }
          done = true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const retryable =
            !(lastError instanceof SkipLimitExceededError) &&
            (retry.retryable ? retry.retryable(lastError) : true);
          if (!retryable || attempt >= retry.maxAttempts) {
            throw lastError instanceof SkipLimitExceededError
              ? lastError
              : new ChunkFailedError(chunkIndex, attempt, lastError);
          }
          chunkRetries++;
          const backoff = Math.min(
            retry.backoffMs * Math.pow(retry.backoffMultiplier, attempt - 1),
            retry.maxBackoffMs
          );
          await this._clock.sleep(backoff);
        }
      }
    }

    return {
      stats: {
        partition,
        itemsRead,
        itemsWritten,
        itemsSkipped: skipped,
        chunksCommitted,
        chunkRetries,
        durationMs: this._clock.now() - started,
      },
      checkpoint: {
        committedOffset: offset,
        chunksCompleted: chunksCommitted,
        skippedCount: skipped,
        timestamp: this._clock.now(),
      },
      drained: eof,
    };
  }
}
