/**
 * Batch Engine
 *
 * Orchestrates a whole job:
 *
 *   - splits the input range across `partitions` contiguous ranges
 *   - runs partitions through a bounded worker pool (Promise-based;
 *     true parallelism comes from async I/O in reader/writer)
 *   - each partition uses ChunkProcessor (retry + skip + checkpoint)
 *   - on restart, resumes each partition from its committed offset
 *   - aggregates metrics: throughput, items read/written/skipped
 *   - fires completion callbacks
 *
 * Partitioning: contiguous index ranges (partition p covers
 * [p*stride, (p+1)*stride)) so checkpoints remain offset-meaningful.
 * When total is unknown, partition 0 runs unbounded and partitions
 * >0 are sized from `reader.total()` when available, else deferred.
 *
 * @module BatchProcessingLayer/Engine
 */

import {
  BatchJob,
  CheckpointStore,
  JobExecution,
  JobListener,
  BatchClock,
  SystemBatchClock,
  PartitionStats,
  Checkpoint,
} from './types';
import { ChunkProcessor } from './ChunkProcessor';
import { InMemoryCheckpointStore, SkippersLog } from './Checkpointing';

export interface BatchEngineConfig {
  readonly checkpointStore?: CheckpointStore;
  readonly skippers?: SkippersLog;
  readonly clock?: BatchClock;
  /** Global default max worker concurrency. */
  readonly maxWorkers?: number;
}

/** A promise-based worker pool with a fixed concurrency bound. */
export class WorkerPool {
  private _running = 0;
  private _queue: Array<() => void> = [];

  constructor(readonly size: number) {
    if (size < 1) throw new Error('pool size must be >= 1');
  }

  /** Run `task` when a slot frees. */
  submit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this._running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this._running--;
            const next = this._queue.shift();
            if (next) next();
          });
      };
      if (this._running < this._size()) run();
      else this._queue.push(run);
    });
  }

  private _size(): number {
    return this.size;
  }

  get running(): number {
    return this._running;
  }

  get queued(): number {
    return this._queue.length;
  }
}

export class BatchEngine {
  private _store: CheckpointStore;
  private _skippers: SkippersLog;
  private _clock: BatchClock;
  private _maxWorkers: number;
  private _listeners: JobListener[];

  constructor(config?: BatchEngineConfig) {
    this._store = config?.checkpointStore ?? new InMemoryCheckpointStore();
    this._skippers = config?.skippers ?? new SkippersLog();
    this._clock = config?.clock ?? new SystemBatchClock();
    this._maxWorkers = config?.maxWorkers ?? 4;
    this._listeners = [];
  }

  get skippers(): SkippersLog {
    return this._skippers;
  }

  get checkpoints(): CheckpointStore {
    return this._store;
  }

  addListener(l: JobListener): void {
    this._listeners.push(l);
  }

  /**
   * Execute a job. Returns a JobExecution summary; failures also
   * resolve with status 'failed' (no throw) — the error is captured
   * in `execution.error`.
   */
  async run<I, O>(job: BatchJob<I, O>): Promise<JobExecution> {
    const started = this._clock.now();
    const partitions = Math.max(1, job.partitions ?? 1);
    const workers = Math.max(1, Math.min(job.workers ?? partitions, this._maxWorkers));
    const total = job.reader.total?.();

    // Compute contiguous ranges per partition.
    const ranges: Array<{ start: number; end?: number }> = [];
    if (total === undefined || partitions === 1) {
      ranges.push({ start: 0, end: total });
    } else {
      const stride = Math.ceil(total / partitions);
      for (let p = 0; p < partitions; p++) {
        const start = p * stride;
        if (start >= total) break;
        ranges.push({ start, end: Math.min(start + stride, total) });
      }
    }

    const processor = new ChunkProcessor({
      checkpointStore: this._store,
      skippers: this._skippers,
      clock: this._clock,
      listeners: this._listeners,
    });
    const pool = new WorkerPool(workers);

    // Detect restart: any existing checkpoint for this job.
    let restartedFrom: Checkpoint | undefined;
    for (let p = 0; p < ranges.length; p++) {
      const cp = await this._store.load(job.id, p);
      if (cp && (!restartedFrom || cp.committedOffset < restartedFrom.committedOffset)) {
        restartedFrom = cp;
      }
    }

    const results: PartitionStats[] = [];
    let failure: Error | undefined;

    const tasks = ranges.map((range, p) =>
      pool.submit(async () => {
        try {
          const res = await processor.run(job, p, range);
          results[p] = res.stats;
        } catch (err) {
          failure = err instanceof Error ? err : new Error(String(err));
          results[p] = {
            partition: p,
            itemsRead: 0,
            itemsWritten: 0,
            itemsSkipped: 0,
            chunksCommitted: 0,
            chunkRetries: 0,
            durationMs: this._clock.now() - started,
          };
        }
      })
    );
    await Promise.all(tasks);

    const durationMs = this._clock.now() - started;
    const itemsRead = results.reduce((a, s) => a + s.itemsRead, 0);
    const itemsWritten = results.reduce((a, s) => a + s.itemsWritten, 0);
    const itemsSkipped = results.reduce((a, s) => a + s.itemsSkipped, 0);
    const chunksCommitted = results.reduce((a, s) => a + s.chunksCommitted, 0);

    const execution: JobExecution = {
      jobId: job.id,
      status: failure ? 'failed' : 'completed',
      partitions: results,
      itemsRead,
      itemsWritten,
      itemsSkipped,
      chunksCommitted,
      throughputPerSec: durationMs > 0 ? (itemsRead / durationMs) * 1000 : itemsRead,
      durationMs,
      restartedFrom,
      error: failure?.message,
    };

    if (failure) {
      for (const l of this._listeners) l.onJobFailed?.(job.id, failure, execution);
    } else {
      for (const l of this._listeners) l.onJobComplete?.(execution);
    }
    return execution;
  }

  /**
   * Restart a previously failed/interrupted job: same run path, but
   * checkpoints in the store make each partition resume where it
   * stopped.
   */
  async restart<I, O>(job: BatchJob<I, O>): Promise<JobExecution> {
    return this.run(job);
  }
}
