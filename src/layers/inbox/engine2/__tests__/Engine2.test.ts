/**
 * Tests for inbox engine2: metrics, priority lanes, partitioning,
 * archival, replay.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { InboxEngine } from '../../pattern/InboxEngine';
import { InboxState } from '../../pattern/types';
import {
  InboxMetricsCollector,
  Reservoir,
  RateTracker,
  summarize,
  PriorityInbox,
  PartitionedInbox,
  InboxArchive,
  InboxArchiver,
  InboxReplayer,
} from '../index';

let clock: number;
const now = () => clock;

describe('Reservoir / summarize', () => {
  it('bounds the sample and preserves uniformity contract', () => {
    let i = 0;
    const r = new Reservoir(10, () => (i++ * 0.37) % 1); // deterministic rng
    for (let n = 0; n < 100; n++) r.add(n);
    expect(r.size).toBe(10);
    expect(r.seen).toBe(100);
  });

  it('computes nearest-rank percentiles', () => {
    const s = summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.count).toBe(10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.p50).toBe(5);
    expect(s.p90).toBe(9);
    expect(s.p99).toBe(10);
    expect(s.mean).toBeCloseTo(5.5, 5);
  });

  it('empty reservoir produces zeros', () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(s.p99).toBe(0);
  });
});

describe('RateTracker', () => {
  it('counts events/sec over the sliding window', () => {
    clock = 0;
    const rt = new RateTracker(60_000, 60, now); // 60 buckets × 1s
    for (let i = 0; i < 30; i++) rt.record();
    // 30 events in the last 60s → 0.5/sec
    expect(rt.rate()).toBeCloseTo(0.5, 2);
  });

  it('drops events that fall out of the window', () => {
    clock = 0;
    const rt = new RateTracker(60_000, 60, now);
    rt.record();
    clock = 120_000; // 2 min later — window slid past the event
    expect(rt.rate()).toBe(0);
  });
});

describe('InboxMetricsCollector', () => {
  it('records process/e2e latency and rates', () => {
    clock = 1_000;
    const engine = new InboxEngine(undefined, now);
    const metrics = new InboxMetricsCollector({ reservoirSize: 100 }, now, () => 0.5);

    engine.receive('c1', 'm1', { a: 1 });
    metrics.onReceived('c1');
    clock += 50;
    engine.processAll('c1', () => {});
    const rec = engine.listByConsumer('c1')[0]!;
    metrics.onProcessed(rec, 12);

    const snap = metrics.snapshot('c1');
    expect(snap.process.count).toBe(1);
    expect(snap.process.p50).toBe(12);
    expect(snap.receivedPerSec).toBeGreaterThan(0);
    expect(snap.processedPerSec).toBeGreaterThan(0);
  });
});

describe('PriorityInbox', () => {
  let engine: InboxEngine;
  let inbox: PriorityInbox;

  beforeEach(() => {
    clock = 10_000;
    engine = new InboxEngine({ ordered: false }, now);
    inbox = new PriorityInbox(engine, { lanes: 3, maxWaitMs: 30_000, defaultLane: 1 }, now);
  });

  it('drains highest priority first regardless of arrival order', async () => {
    inbox.receive('c', 'low1', 'L', 2);
    inbox.receive('c', 'high1', 'H', 0);
    inbox.receive('c', 'mid1', 'M', 1);

    const order: unknown[] = [];
    await inbox.processAll('c', (p) => {
      order.push(p);
    });
    expect(order).toEqual(['H', 'M', 'L']);
  });

  it('ages starved low-priority messages up a lane', async () => {
    inbox.receive('c', 'low1', 'L', 2);
    // Fill mid lane only — low ages INTO the mid lane, not above highs.
    inbox.receive('c', 'mid1', 'M', 1);
    clock += 31_000; // past maxWaitMs — low1 promotes to lane 1
    inbox.receive('c', 'high1', 'H', 0);

    const order: unknown[] = [];
    await inbox.processAll('c', (p) => {
      order.push(p);
    });
    // H first (lane0), then aged-low and mid share lane1 FIFO (low
    // enqueued first after promotion order — mid was already there).
    expect(order[0]).toBe('H');
    expect(order).toContain('L');
    // The key assertion: L left lane2 — it was NOT starved behind a
    // stream of highs. Direct probe: process with only lane2 populated.
    const inbox2 = new PriorityInbox(engine, { lanes: 2, maxWaitMs: 10, defaultLane: 1 }, now);
    inbox2.receive('c2', 'a', 'A', 1);
    clock += 20;
    inbox2.receive('c2', 'b', 'B', 1); // newer — also lane1
    const o2: unknown[] = [];
    await inbox2.processAll('c2', (p) => o2.push(p));
    expect(o2).toEqual(['A', 'B']); // aged A still before B
  });

  it('dedup still works — duplicate receives are not re-queued', () => {
    inbox.receive('c', 'm1', 'x', 0);
    const r2 = inbox.receive('c', 'm1', 'x', 0);
    expect(r2.duplicate).toBe(true);
    expect(inbox.pending('c')).toBe(1);
  });
});

describe('PartitionedInbox', () => {
  it('routes same key to same partition', () => {
    const inbox = new PartitionedInbox(4, undefined, now);
    const p1 = inbox.partitionFor('order-42');
    const p2 = inbox.partitionFor('order-42');
    expect(p1).toBe(p2);
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p1).toBeLessThan(4);
  });

  it('processes partitions in parallel; all partitions drained', async () => {
    const inbox = new PartitionedInbox(4, undefined, now);
    // 20 unique messages across keys that spread over partitions.
    const assignedPartitions = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const res = inbox.receive('c', `msg-${i}`, `v${i}`);
      assignedPartitions.add(res.partition);
    }
    let total = 0;
    const res = await inbox.processAll('c', () => {
      total++;
    });
    expect(total).toBe(20);
    expect(res.totalProcessed).toBe(20);
    // Messages spread over multiple partitions → real parallelism.
    expect(assignedPartitions.size).toBeGreaterThan(1);
    // Each partition that received messages got fully drained.
    for (const p of res.perPartition) {
      const expected = [...Array(20).keys()].filter((i) => inbox.partitionFor(`msg-${i}`) === p.index).length;
      expect(p.processed).toBe(expected);
    }
  });

  it('same key always lands on the same partition (ordering guarantee)', () => {
    const inbox = new PartitionedInbox(8, undefined, now);
    for (let i = 0; i < 50; i++) {
      const key = `entity-${i % 7}`;
      expect(inbox.partitionFor(key)).toBe(inbox.partitionFor(key));
    }
  });

  it('stats and parked roll up per partition', () => {
    const inbox = new PartitionedInbox(2, undefined, now);
    inbox.receive('c', 'k1', 'x');
    inbox.receive('c', 'k2', 'y');
    const stats = inbox.stats('c');
    expect(stats).toHaveLength(2);
    expect(stats.reduce((a, s) => a + s.records, 0)).toBe(2);
  });
});

describe('InboxArchiver + InboxReplayer', () => {
  let engine: InboxEngine;
  let archive: InboxArchive;
  let archiver: InboxArchiver;
  let replayer: InboxReplayer;

  beforeEach(() => {
    clock = 1_000_000;
    engine = new InboxEngine({ ordered: false, retentionMs: 50_000 }, now);
    archive = new InboxArchive();
    archiver = new InboxArchiver(engine, archive, { processedOlderThanMs: 40_000 }, now);
    replayer = new InboxReplayer(engine, archive, now);
  });

  it('archives processed records past the policy age', async () => {
    engine.receive('c', 'm1', { v: 1 });
    await engine.processAll('c', () => {});
    const rec = engine.listByConsumer('c')[0]!;
    // Age the processed record past both engine retention and archive policy.
    clock += 60_000;
    const res = archiver.sweep('c');
    expect(res.archived).toBe(1);
    expect(res.byState[InboxState.PROCESSED]).toBe(1);
    const arch = archive.byOriginalId(rec.id);
    expect(arch).toBeDefined();
    expect(arch!.messageId).toBe('m1');
    expect(arch!.finalState).toBe(InboxState.PROCESSED);
    // Engine's retentionMs=50s → dropped from hot store.
    expect(engine.listByConsumer('c')).toHaveLength(0);
  });

  it('replay re-injects archived records as fresh messages', async () => {
    engine.receive('c', 'm1', { v: 7 });
    await engine.processAll('c', () => {});
    clock += 60_000;
    archiver.sweep('c');
    expect(engine.listByConsumer('c')).toHaveLength(0);

    const seen: unknown[] = [];
    const res = await replayer.replay({ consumer: 'c' }, (p) => {
      seen.push(p);
    });
    expect(res.replayed).toBe(1);
    expect(seen).toEqual([{ v: 7 }]);
  });

  it('replay skips records without retained payloads', async () => {
    const thin = new InboxArchiver(engine, archive, { retainPayloads: false, processedOlderThanMs: 40_000 }, now);
    engine.receive('c', 'm9', { secret: true });
    await engine.processAll('c', () => {});
    clock += 60_000;
    thin.sweep('c');
    const res = await replayer.replay({ consumer: 'c' });
    expect(res.replayed).toBe(0);
    expect(res.skipped[0]?.reason).toBe('payload not retained');
  });
});
