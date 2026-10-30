/**
 * Batch Engine — Shared Types
 *
 * Type definitions for chunk-oriented batch processing:
 * read chunk -> process -> write, with per-chunk retry, record-level
 * skip limits, partitioned parallel execution, checkpoint restart,
 * metrics and completion callbacks.
 *
 * @module BatchProcessingLayer/Engine
 */

/** A record flowing through the pipeline. */
export interface BatchRecord<T = unknown> {
  /** Position in the input (0-based global index). */
  readonly index: number;
  /** Partition this record belongs to (0-based). */
  readonly partition: number;
  readonly data: T;
}

/** Reads input items chunk-by-chunk from a cursor position. */
export interface ItemReader<T> {
  /**
   * Read up to `count` items starting at `offset`.
   * Returns fewer than `count` items at EOF. Must be a pure read:
   * the engine may re-read the same offset after a chunk retry.
   */
  read(offset: number, count: number): Promise<T[]>;
  /** Total item count if known; engine stops at first short read otherwise. */
  total?(): number;
}

/** Transforms one item; may throw to mark the item failed. */
export interface ItemProcessor<I, O> {
  process(item: I, index: number): O | Promise<O>;
}

/** Writes a chunk of processed items atomically (from the engine's POV). */
export interface ItemWriter<O> {
  write(items: O[], chunkIndex: number): Promise<void>;
}

/** Called for each skipped (faulted-then-skipped) record. */
export interface SkipListener<I> {
  onSkip(item: I, index: number, error: Error): void;
}

/** A durable record of progress for restart. */
export interface Checkpoint {
  /** Items committed so far (next read offset). */
  readonly committedOffset: number;
  /** Chunks completed. */
  readonly chunksCompleted: number;
  /** Items skipped so far (for skip-limit accounting across restarts). */
  readonly skippedCount: number;
  /** Timestamp of last commit. */
  readonly timestamp: number;
}

/** Persists checkpoints between run attempts. */
export interface CheckpointStore {
  load(jobId: string, partition: number): Promise<Checkpoint | undefined>;
  save(jobId: string, partition: number, checkpoint: Checkpoint): Promise<void>;
  clear(jobId: string): Promise<void>;
}

/** Retry policy for chunk-level failures. */
export interface RetryPolicy {
  /** Max attempts per chunk (1 = no retry). */
  readonly maxAttempts: number;
  /** Initial backoff before retry (ms). */
  readonly backoffMs: number;
  /** Multiplier applied to backoff per attempt. */
  readonly backoffMultiplier: number;
  /** Cap on backoff. */
  readonly maxBackoffMs: number;
  /** Decide whether an error is retryable; default: all are. */
  readonly retryable?: (error: Error) => boolean;
}

/** Fault-tolerance policy for bad records. */
export interface SkipPolicy {
  /** Max skipped records allowed job-wide before failing. */
  readonly maxSkips: number;
  /** Per-chunk alternative limit (whichever hits first). */
  readonly maxSkipsPerChunk?: number;
  /** Predicate: is this error skippable? Default: all are. */
  readonly skippable?: (error: Error) => boolean;
}

/** Job definition. */
export interface BatchJob<I = unknown, O = unknown> {
  readonly id: string;
  readonly reader: ItemReader<I>;
  readonly processor: ItemProcessor<I, O>;
  readonly writer: ItemWriter<O>;
  /** Items per chunk. */
  readonly chunkSize: number;
  readonly retry?: RetryPolicy;
  readonly skip?: SkipPolicy;
  /** Partition count for parallel execution (1 = serial). */
  readonly partitions?: number;
  /** Worker pool size per partition (defaults to partitions). */
  readonly workers?: number;
}

/** Partition execution stats. */
export interface PartitionStats {
  readonly partition: number;
  readonly itemsRead: number;
  readonly itemsWritten: number;
  readonly itemsSkipped: number;
  readonly chunksCommitted: number;
  readonly chunkRetries: number;
  readonly durationMs: number;
}

/** Job-level execution summary. */
export interface JobExecution {
  readonly jobId: string;
  readonly status: 'completed' | 'failed' | 'stopped';
  readonly partitions: readonly PartitionStats[];
  readonly itemsRead: number;
  readonly itemsWritten: number;
  readonly itemsSkipped: number;
  readonly chunksCommitted: number;
  /** items/sec throughput measured over wall-clock duration. */
  readonly throughputPerSec: number;
  readonly durationMs: number;
  /** Restart information. */
  readonly restartedFrom?: Checkpoint;
  readonly error?: string;
}

/** Completion callback hook. */
export interface JobListener {
  onChunkCommitted?(partition: number, chunkIndex: number, itemsWritten: number): void;
  onItemSkipped?(partition: number, index: number, error: Error): void;
  onJobComplete?(execution: JobExecution): void;
  onJobFailed?(jobId: string, error: Error, execution: JobExecution): void;
}

/** Injectable clock + delay for timing-sensitive code. */
export interface BatchClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export class SystemBatchClock implements BatchClock {
  now(): number {
    return Date.now();
  }
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Error raised when a chunk exhausts retries. */
export class ChunkFailedError extends Error {
  readonly chunkIndex: number;
  readonly attempts: number;
  constructor(chunkIndex: number, attempts: number, cause: Error) {
    super(`chunk ${chunkIndex} failed after ${attempts} attempt(s): ${cause.message}`);
    this.name = 'ChunkFailedError';
    this.chunkIndex = chunkIndex;
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** Error raised when the job exceeds its skip limit. */
export class SkipLimitExceededError extends Error {
  readonly skips: number;
  readonly limit: number;
  constructor(skips: number, limit: number) {
    super(`skip limit exceeded: ${skips} > ${limit}`);
    this.name = 'SkipLimitExceededError';
    this.skips = skips;
    this.limit = limit;
  }
}
