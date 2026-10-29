/**
 * Stream Processing Engine Tests
 *
 * Windows, watermarks, aggregations, joins, temporal tables, checkpoints.
 */

import { describe, it, expect } from 'bun:test';
import {
  tumblingWindows,
  slidingWindows,
  countAggregator,
  sumAggregator,
  avgAggregator,
  minAggregator,
  maxAggregator,
  customAggregator,
  WindowedAggregate,
  IntervalJoin,
  TemporalTable,
  streamTableJoin,
  IdempotentSink,
  CheckpointCoordinator,
  type StreamRecord,
} from '../implementations/StreamEngine';

function rec<T>(timestamp: number, value: T, key?: string): StreamRecord<T> {
  return { timestamp, value, key };
}

describe('window assigners', () => {
  it('tumbling: aligns to fixed grid', () => {
    const a = tumblingWindows(10);
    expect(a(0)).toEqual([{ start: 0, end: 10 }]);
    expect(a(7)).toEqual([{ start: 0, end: 10 }]);
    expect(a(10)).toEqual([{ start: 10, end: 20 }]);
    expect(a(23)).toEqual([{ start: 20, end: 30 }]);
  });

  it('sliding: returns all windows containing t', () => {
    const a = slidingWindows(10, 5);
    // t=7 is inside [0,10) and [5,15)
    const w = a(7);
    expect(w).toContainEqual({ start: 0, end: 10 });
    expect(w).toContainEqual({ start: 5, end: 15 });
    expect(w).toHaveLength(2);
    // t=0 belongs only to [0,10)
    expect(a(0)).toEqual([{ start: 0, end: 10 }]);
  });
});

describe('aggregators', () => {
  it('count', () => {
    const agg = countAggregator<number>();
    let acc = agg.createAccumulator();
    acc = agg.add(acc, 1);
    acc = agg.add(acc, 2);
    expect(agg.getResult(acc)).toBe(2);
    expect(agg.merge(3, 4)).toBe(7);
  });

  it('sum / avg / min / max', () => {
    const sum = sumAggregator();
    const avg = avgAggregator();
    const min = minAggregator();
    const max = maxAggregator();
    let s = sum.createAccumulator();
    let a = avg.createAccumulator();
    let mn = min.createAccumulator();
    let mx = max.createAccumulator();
    for (const v of [3, 1, 4, 1, 5]) {
      s = sum.add(s, v);
      a = avg.add(a, v);
      mn = min.add(mn, v);
      mx = max.add(mx, v);
    }
    expect(sum.getResult(s)).toBe(14);
    expect(avg.getResult(a)).toBeCloseTo(2.8);
    expect(min.getResult(mn)).toBe(1);
    expect(max.getResult(mx)).toBe(5);
  });

  it('custom aggregator', () => {
    const collect = customAggregator<number, number[], number[]>(
      'collect',
      () => [],
      (acc, v) => [...acc, v],
      (a) => a,
      (a, b) => [...a, ...b]
    );
    let acc = collect.createAccumulator();
    acc = collect.add(acc, 1);
    acc = collect.add(acc, 2);
    expect(collect.getResult(acc)).toEqual([1, 2]);
  });
});

describe('WindowedAggregate — tumbling', () => {
  it('emits window results after watermark passes window end', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      sumAggregator(),
      { allowedLatenessMs: 0 }
    );
    op.process(rec(1, 5, 'k'));
    op.process(rec(2, 7, 'k'));
    expect(op.drainResults()).toHaveLength(0); // window [0,10) still open
    op.process(rec(11, 1, 'k')); // advances watermark to 11 → closes [0,10)
    const out = op.drainResults();
    expect(out).toHaveLength(1);
    expect(out[0].window).toEqual({ start: 0, end: 10 });
    expect(out[0].value).toBe(12);
    expect(out[0].count).toBe(2);
    expect(out[0].key).toBe('k');
  });

  it('groups windows per key', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      countAggregator(),
      {}
    );
    op.process(rec(1, 0, 'a'));
    op.process(rec(2, 0, 'b'));
    op.process(rec(3, 0, 'a'));
    op.process(rec(20, 0, 'x')); // advances wm to 20, fires [0,10) for a and b
    // x's own window [20,30) is still open; force-close it.
    op.flush();
    const out = op.drainResults();
    const byKey = new Map(out.map((r) => [r.key, r.value]));
    expect(byKey.get('a')).toBe(2);
    expect(byKey.get('b')).toBe(1);
    expect(byKey.get('x')).toBe(1);
  });

  it('flush emits all open windows', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      maxAggregator(),
      {}
    );
    op.process(rec(3, 42, 'k'));
    op.flush();
    const out = op.drainResults();
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(42);
  });
});

describe('WindowedAggregate — sliding', () => {
  it('a record contributes to every containing window', () => {
    const op = new WindowedAggregate<number, number, number>(
      'sliding',
      slidingWindows(10, 5),
      sumAggregator(),
      {}
    );
    op.process(rec(7, 10, 'k'));
    op.process(rec(100, 0, 'k')); // push watermark past everything
    const out = op.drainResults();
    // t=7 in windows [0,10) and [5,15)
    const w0 = out.find((r) => r.window.start === 0);
    const w5 = out.find((r) => r.window.start === 5);
    expect(w0?.value).toBe(10);
    expect(w5?.value).toBe(10);
  });
});

describe('WindowedAggregate — sessions', () => {
  it('merges events within the gap into one session', () => {
    const op = new WindowedAggregate<number, number, number>(
      'session',
      () => [],
      countAggregator(),
      { sessionGapMs: 10 }
    );
    op.process(rec(0, 0, 'u'));
    op.process(rec(5, 0, 'u'));
    op.process(rec(14, 0, 'u')); // still within gap of session ending at 15
    // Separate session: gap of >10 after previous end
    op.process(rec(50, 0, 'u'));
    // Close everything
    op.process(rec(1000, 0, 'u'));
    const out = op.drainResults();
    const sessionCounts = out.filter((r) => r.count >= 1).map((r) => r.count);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(sessionCounts).toContain(3);
  });

  it('sessions are per key', () => {
    const op = new WindowedAggregate<number, number, number>(
      'session',
      () => [],
      countAggregator(),
      { sessionGapMs: 10 }
    );
    op.process(rec(0, 0, 'a'));
    op.process(rec(5, 0, 'b'));
    op.process(rec(1000, 0, 'c'));
    const out = op.drainResults();
    expect(out.filter((r) => r.key === 'a')).toHaveLength(1);
    expect(out.filter((r) => r.key === 'b')).toHaveLength(1);
  });
});

describe('WindowedAggregate — watermarks & lateness', () => {
  it('drops late records by default and counts them', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      countAggregator(),
      { allowedLatenessMs: 0 }
    );
    op.process(rec(50, 0, 'k')); // watermark = 50
    op.process(rec(5, 0, 'k')); // late: 5 < 50
    expect(op.lateCount).toBe(1);
    expect(op.drainResults()).toHaveLength(0); // [0,10) already fired? no — wm=50 fired it but it was empty
  });

  it('side-output captures late records', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      countAggregator(),
      { allowedLatenessMs: 0, latePolicy: 'side-output' }
    );
    op.process(rec(50, 0, 'k'));
    op.process(rec(5, 0, 'k'));
    expect(op.lateRecords).toHaveLength(1);
    expect(op.lateRecords[0].timestamp).toBe(5);
  });

  it('allowedLateness delays the watermark', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      countAggregator(),
      { allowedLatenessMs: 10 }
    );
    op.process(rec(5, 0, 'k')); // seeds window [0,10)
    op.process(rec(15, 0, 'k')); // maxTs=15, wm=5 → [0,10) still open (end=10 > 5)
    expect(op.drainResults()).toHaveLength(0);
    op.process(rec(21, 0, 'k')); // wm=11 → [0,10) fires
    const out = op.drainResults();
    expect(out).toHaveLength(1);
    expect(out[0].window.start).toBe(0);
    expect(out[0].count).toBe(1);
  });
});

describe('WindowedAggregate — snapshot/restore', () => {
  it('state survives a snapshot/restore round trip', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      sumAggregator(),
      {}
    );
    op.process(rec(1, 5, 'k'));
    const snap = op.snapshotState();

    const restored = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      sumAggregator(),
      {}
    );
    restored.restoreState(snap);
    restored.process(rec(2, 3, 'k'));
    restored.process(rec(20, 0, 'k'));
    const out = restored.drainResults();
    const w = out.find((r) => r.window.start === 0);
    expect(w?.value).toBe(8);
  });
});

describe('IntervalJoin', () => {
  it('joins records within the interval on the same key', () => {
    const join = new IntervalJoin<number, string>(-5, 5);
    join.left(rec(100, 1, 'k'));
    join.right(rec(103, 'a', 'k')); // 103 ∈ [95,105]
    join.right(rec(120, 'b', 'k')); // outside
    const out = join.drain();
    expect(out).toHaveLength(1);
    expect(out[0].right.value).toBe('a');
  });

  it('does not join different keys', () => {
    const join = new IntervalJoin<number, string>(-10, 10);
    join.left(rec(100, 1, 'k1'));
    join.right(rec(100, 'a', 'k2'));
    expect(join.drain()).toHaveLength(0);
  });

  it('symmetric: right arrivals probe existing lefts', () => {
    const join = new IntervalJoin<number, string>(0, 10);
    join.right(rec(105, 'x', 'k'));
    join.left(rec(100, 1, 'k')); // right must be within [100,110] → 105 ✓
    const out = join.drain();
    expect(out).toHaveLength(1);
  });

  it('one left can match multiple rights in interval', () => {
    const join = new IntervalJoin<number, string>(-10, 10);
    join.left(rec(100, 1, 'k'));
    join.right(rec(95, 'a', 'k'));
    join.right(rec(105, 'b', 'k'));
    join.right(rec(200, 'c', 'k'));
    expect(join.drain()).toHaveLength(2);
  });
});

describe('TemporalTable + streamTableJoin', () => {
  it('returns the row valid at the record event time', () => {
    const t = new TemporalTable<{ rate: number }>();
    t.put('EUR', { rate: 1.0 }, 100);
    t.put('EUR', { rate: 1.2 }, 200);
    t.put('USD', { rate: 0.9 }, 50);
    expect(t.getAt('EUR', 150)?.rate).toBe(1.0);
    expect(t.getAt('EUR', 250)?.rate).toBe(1.2);
    expect(t.getAt('EUR', 50)).toBeUndefined();
    expect(t.getAt('USD', 100)?.rate).toBe(0.9);
  });

  it('enriches stream records via streamTableJoin', () => {
    const t = new TemporalTable<{ label: string }>();
    t.put('k', { label: 'v1' }, 0);
    t.put('k', { label: 'v2' }, 100);
    const out = streamTableJoin(
      [rec(50, 1, 'k'), rec(150, 2, 'k'), rec(150, 3, 'missing')],
      t,
      (v, row) => ({ v, label: row?.label ?? 'none' })
    );
    expect(out[0].value).toEqual({ v: 1, label: 'v1' });
    expect(out[1].value).toEqual({ v: 2, label: 'v2' });
    expect(out[2].value).toEqual({ v: 3, label: 'none' });
  });
});

describe('Exactly-once: IdempotentSink + CheckpointCoordinator', () => {
  it('deduplicates by idempotency key', () => {
    const sink = new IdempotentSink<number>();
    expect(sink.write('w:0:k', 5)).toBe(true);
    expect(sink.write('w:0:k', 99)).toBe(false); // replay after crash
    expect(sink.get('w:0:k')).toBe(5); // first write wins
    expect(sink.writeCount).toBe(1);
    expect(sink.duplicates).toBe(1);
  });

  it('snapshot + restore recovers applied keys', () => {
    const sink = new IdempotentSink<string>();
    sink.write('a', '1');
    sink.write('b', '2');
    const snap = sink.snapshot();

    const restored = new IdempotentSink<string>();
    restored.restore(snap.keys, snap.values);
    expect(restored.write('a', 'different')).toBe(false);
    expect(restored.get('b')).toBe('2');
  });

  it('checkpoint barriers snapshot operator state at intervals', () => {
    const op = new WindowedAggregate<number, number, number>(
      'tumbling',
      tumblingWindows(10),
      countAggregator(),
      {}
    );
    const coord = new CheckpointCoordinator({ barrierIntervalRecords: 3 });
    coord.registerOperator('agg', op);
    const src = { offset: 0 };
    coord.registerSource('input', src);

    const snapshots = [];
    for (let i = 0; i < 7; i++) {
      op.process(rec(i, 0, 'k'));
      src.offset = i;
      const s = coord.recordProcessed();
      if (s) snapshots.push(s);
    }
    expect(snapshots).toHaveLength(2); // at records 3 and 6
    expect(snapshots[0].sourceOffsets.get('input')).toBe(2);
    expect(snapshots[1].sourceOffsets.get('input')).toBe(5);
    expect(coord.lastCompleted()?.id).toBe(2);
  });
});
