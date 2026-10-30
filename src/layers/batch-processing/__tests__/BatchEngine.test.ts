/**
 * Batch engine tests: chunk processing, retry, skip limits,
 * checkpoint restart, partitioning, metrics, callbacks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BatchEngine, WorkerPool } from '../engine/BatchEngine';
import { ChunkProcessor } from '../engine/ChunkProcessor';
import { InMemoryCheckpointStore, SkippersLog } from '../engine/Checkpointing';
import type {
  BatchClock,
  BatchJob,
  ItemReader,
  ItemProcessor,
  ItemWriter,
  JobExecution,
} from '../engine/types';

class FakeClock implements BatchClock {
  t = 0;
  sleeps: number[] = [];
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += ms;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** In-memory list reader. */
class ListReader<T> implements ItemReader<T> {
  constructor(private items: T[]) {}
  async read(offset: number, count: number): Promise<T[]> {
    return this.items.slice(offset, offset + count);
  }
  total(): number {
    return this.items.length;
  }
}

/** Collecting writer. */
class ListWriter<O> implements ItemWriter<O> {
  chunks: O[][] = [];
  failOnChunks = new Set<number>();
  failTimes = 0;
  async write(items: O[], chunkIndex: number): Promise<void> {
    if (this.failOnChunks.has(chunkIndex) && this.failTimes > 0) {
      this.failTimes--;
      throw new Error('writer failure');
    }
    this.chunks.push(items);
  }
  get flat(): O[] {
    return this.chunks.flat();
  }
}

const identity: ItemProcessor<number, number> = {
  process: (n) => n,
};

function makeJob(partial: Partial<BatchJob<number, number>> & { items: number[] }): BatchJob<number, number> {
  return {
    id: partial.id ?? 'job1',
    reader: new ListReader(partial.items),
    processor: partial.processor ?? identity,
    writer: partial.writer ?? new ListWriter(),
    chunkSize: partial.chunkSize ?? 3,
    retry: partial.retry,
    skip: partial.skip,
    partitions: partial.partitions,
    workers: partial.workers,
  };
}

describe('ChunkProcessor', () => {
  let store: InMemoryCheckpointStore;
  let skippers: SkippersLog;
  let clock: FakeClock;
  let proc: ChunkProcessor;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
    skippers = new SkippersLog();
    clock = new FakeClock();
    proc = new ChunkProcessor({ checkpointStore: store, skippers, clock });
  });

  it('processes all items in chunks', async () => {
    const writer = new ListWriter<number>();
    const res = await proc.run(makeJob({ items: [1, 2, 3, 4, 5, 6, 7], writer, chunkSize: 3 }), 0, { start: 0 });
    expect(writer.chunks.map((c) => c.length)).toEqual([3, 3, 1]);
    expect(res.stats.itemsRead).toBe(7);
    expect(res.stats.itemsWritten).toBe(7);
    expect(res.stats.chunksCommitted).toBe(3);
    expect(res.drained).toBe(true);
  });

  it('saves a checkpoint after each chunk', async () => {
    const writer = new ListWriter<number>();
    await proc.run(makeJob({ items: [1, 2, 3, 4], writer, chunkSize: 2 }), 0, { start: 0 });
    const cp = await store.load('job1', 0);
    expect(cp?.committedOffset).toBe(4);
    expect(cp?.chunksCompleted).toBe(2);
  });

  it('retries a failing chunk with backoff then succeeds', async () => {
    const writer = new ListWriter<number>();
    writer.failOnChunks.add(1);
    writer.failTimes = 2; // fail twice then succeed
    const job = makeJob({
      items: [1, 2, 3, 4],
      writer,
      chunkSize: 2,
      retry: { maxAttempts: 3, backoffMs: 100, backoffMultiplier: 2, maxBackoffMs: 1000 },
    });
    const res = await proc.run(job, 0, { start: 0 });
    expect(res.stats.chunkRetries).toBe(2);
    expect(clock.sleeps).toEqual([100, 200]);
    expect(res.stats.itemsWritten).toBe(4);
  });

  it('fails the chunk after exhausting retries', async () => {
    const writer = new ListWriter<number>();
    writer.failOnChunks.add(0);
    writer.failTimes = 10;
    const job = makeJob({
      items: [1, 2],
      writer,
      chunkSize: 2,
      retry: { maxAttempts: 2, backoffMs: 10, backoffMultiplier: 1, maxBackoffMs: 10 },
    });
    await expect(proc.run(job, 0, { start: 0 })).rejects.toThrow('chunk 0 failed');
  });

  it('skips bad records up to the skip limit and logs them', async () => {
    const writer = new ListWriter<number>();
    const processor: ItemProcessor<number, number> = {
      process: (n) => {
        if (n === 2 || n === 5) throw new Error(`bad ${n}`);
        return n * 10;
      },
    };
    const job = makeJob({
      items: [1, 2, 3, 4, 5],
      processor,
      writer,
      chunkSize: 5,
      skip: { maxSkips: 5 },
    });
    const res = await proc.run(job, 0, { start: 0 });
    expect(writer.flat).toEqual([10, 30, 40]);
    expect(res.stats.itemsSkipped).toBe(2);
    expect(skippers.size).toBe(2);
    expect(skippers.entries()[0]!.index).toBe(1);
  });

  it('aborts when skip limit exceeded', async () => {
    const processor: ItemProcessor<number, number> = {
      process: () => {
        throw new Error('always bad');
      },
    };
    const job = makeJob({
      items: [1, 2, 3],
      processor,
      chunkSize: 3,
      skip: { maxSkips: 1 },
      retry: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1, maxBackoffMs: 0 },
    });
    await expect(proc.run(job, 0, { start: 0 })).rejects.toThrow('skip limit');
    expect(skippers.size).toBe(1);
  });

  it('resumes from checkpoint on restart', async () => {
    // Pre-seed a checkpoint as if 2 items committed already.
    await store.save('job1', 0, {
      committedOffset: 2,
      chunksCompleted: 1,
      skippedCount: 0,
      timestamp: 0,
    });
    const writer = new ListWriter<number>();
    const res = await proc.run(
      makeJob({ items: [1, 2, 3, 4], writer, chunkSize: 2 }),
      0,
      { start: 0 }
    );
    // only items 3,4 processed
    expect(writer.flat).toEqual([3, 4]);
    expect(res.stats.itemsRead).toBe(2);
    expect(res.checkpoint.committedOffset).toBe(4);
  });

  it('honors bounded item ranges', async () => {
    const writer = new ListWriter<number>();
    const res = await proc.run(
      makeJob({ items: [1, 2, 3, 4, 5, 6], writer, chunkSize: 2 }),
      0,
      { start: 2, end: 5 }
    );
    expect(writer.flat).toEqual([3, 4, 5]);
    expect(res.stats.itemsRead).toBe(3);
  });

  it('non-skippable errors fail the chunk immediately', async () => {
    const processor: ItemProcessor<number, number> = {
      process: (n) => {
        if (n === 2) throw new TypeError('fatal');
        return n;
      },
    };
    const job = makeJob({
      items: [1, 2],
      processor,
      chunkSize: 2,
      skip: { maxSkips: 10, skippable: (e) => !(e instanceof TypeError) },
      retry: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1, maxBackoffMs: 0 },
    });
    await expect(proc.run(job, 0, { start: 0 })).rejects.toThrow('fatal');
  });
});

describe('BatchEngine', () => {
  let store: InMemoryCheckpointStore;
  let skippers: SkippersLog;
  let clock: FakeClock;
  let engine: BatchEngine;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
    skippers = new SkippersLog();
    clock = new FakeClock();
    engine = new BatchEngine({ checkpointStore: store, skippers, clock });
  });

  it('runs a single-partition job end to end', async () => {
    const writer = new ListWriter<number>();
    const ex = await engine.run(makeJob({ items: [1, 2, 3, 4, 5], writer, chunkSize: 2 }));
    expect(ex.status).toBe('completed');
    expect(ex.itemsRead).toBe(5);
    expect(ex.itemsWritten).toBe(5);
    expect(ex.chunksCommitted).toBe(3);
    expect(writer.flat).toEqual([1, 2, 3, 4, 5]);
  });

  it('partitions work across contiguous ranges in parallel', async () => {
    const writer = new ListWriter<number>();
    const items = Array.from({ length: 10 }, (_, i) => i);
    const ex = await engine.run(
      makeJob({ items, writer, chunkSize: 2, partitions: 3, workers: 3 })
    );
    expect(ex.status).toBe('completed');
    expect(ex.itemsRead).toBe(10);
    expect(ex.partitions.length).toBe(3);
    // partition 0: items 0-3, partition 1: 4-7, partition 2: 8-9
    expect(writer.flat.sort((a, b) => a - b)).toEqual(items);
    const cps = new Set<number>();
    for (let p = 0; p < 3; p++) {
      const cp = await store.load('job1', p);
      cps.add(cp?.committedOffset);
    }
    expect(cps.has(4)).toBe(true);
    expect(cps.has(8)).toBe(true);
    expect(cps.has(10)).toBe(true);
  });

  it('restarts a failed job from committed offsets', async () => {
    const writer = new ListWriter<number>();
    const processor: ItemProcessor<number, number> = {
      process: (n) => {
        if (n === 4) throw new Error('boom');
        return n;
      },
    };
    const job = makeJob({
      items: [1, 2, 3, 4, 5, 6],
      processor,
      writer,
      chunkSize: 2,
      retry: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1, maxBackoffMs: 0 },
    });
    const ex1 = await engine.run(job);
    expect(ex1.status).toBe('failed');
    // First chunk committed (items 1,2).
    expect((await store.load('job1', 0))?.committedOffset).toBe(2);

    // Fix the processor and restart — should resume at offset 2.
    const writer2 = new ListWriter<number>();
    const job2 = makeJob({
      items: [1, 2, 3, 4, 5, 6],
      writer: writer2,
      chunkSize: 2,
    });
    const ex2 = await engine.restart(job2);
    expect(ex2.status).toBe('completed');
    expect(writer2.flat).toEqual([3, 4, 5, 6]);
    expect(ex2.restartedFrom?.committedOffset).toBe(2);
  });

  it('fires completion callbacks', async () => {
    const events: string[] = [];
    engine.addListener({
      onChunkCommitted: (p, c, n) => events.push(`chunk:${p}:${c}:${n}`),
      onJobComplete: (ex) => events.push(`done:${ex.status}`),
    });
    await engine.run(makeJob({ items: [1, 2, 3], chunkSize: 2 }));
    expect(events.filter((e) => e.startsWith('chunk:')).length).toBe(2);
    expect(events.at(-1)).toBe('done:completed');
  });

  it('fires failure callback on job failure', async () => {
    const seen: string[] = [];
    engine.addListener({
      onJobFailed: (id, err) => seen.push(`${id}:${err.message}`),
    });
    const writer = new ListWriter<number>();
    writer.failOnChunks.add(0);
    writer.failTimes = 10;
    await engine.run(
      makeJob({
        items: [1],
        writer,
        chunkSize: 1,
        retry: { maxAttempts: 1, backoffMs: 0, backoffMultiplier: 1, maxBackoffMs: 0 },
      })
    );
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain('job1:');
  });

  it('computes throughput', async () => {
    const ex = await engine.run(makeJob({ items: [1, 2, 3, 4], chunkSize: 4 }));
    expect(ex.throughputPerSec).toBeGreaterThanOrEqual(0);
    expect(ex.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('writes skip lines for skipped records', async () => {
    const processor: ItemProcessor<number, number> = {
      process: (n) => {
        if (n === 2) throw new Error('bad');
        return n;
      },
    };
    await engine.run(
      makeJob({ items: [1, 2, 3], processor, chunkSize: 3, skip: { maxSkips: 5 } })
    );
    const lines = skippers.toLines();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('index=1');
    expect(lines[0]).toContain('job=job1');
  });
});

describe('WorkerPool', () => {
  it('bounds concurrency', async () => {
    const pool = new WorkerPool(2);
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    };
    await Promise.all([
      pool.submit(task),
      pool.submit(task),
      pool.submit(task),
      pool.submit(task),
    ]);
    expect(maxRunning).toBe(2);
  });
});
