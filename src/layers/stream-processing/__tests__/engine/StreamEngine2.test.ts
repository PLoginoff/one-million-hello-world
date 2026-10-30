/**
 * Stream-processing engine tests: watermark generators (bounded
 * out-of-orderness, per-partition idleness), managed window state,
 * windowed join with pruning, two-phase exactly-once sink, late policies.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BoundedOutOfOrderness,
  PerPartitionWatermark,
  WindowStateStore,
  ExactlyOnceSink,
  SourceCursor,
  LateDataRouter,
  WindowedStreamJoin,
} from '../../engine';
import {
  tumblingWindows,
  countAggregator,
  sumAggregator,
} from '../../implementations/StreamEngine';

describe('BoundedOutOfOrderness', () => {
  it('watermark = maxTs - lateness and is monotonic', () => {
    const g = new BoundedOutOfOrderness(1000);
    expect(g.observe(5000)).toBe(4000);
    expect(g.observe(3000)).toBe(4000); // older record: wm unchanged
    expect(g.observe(7000)).toBe(6000);
  });

  it('starts at -inf', () => {
    expect(new BoundedOutOfOrderness(0).current()).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('PerPartitionWatermark', () => {
  it('global wm is min over active partitions', () => {
    const g = new PerPartitionWatermark({ latenessMs: 100, idleTimeoutMs: 10_000 });
    g.observePartition('p0', 5000, 0);
    g.observePartition('p1', 8000, 0);
    expect(g.current()).toBe(4900); // p0 lags → min wins
    g.observePartition('p0', 9000, 0);
    expect(g.current()).toBe(7900);
  });

  it('idle partitions stop holding the watermark back', () => {
    const g = new PerPartitionWatermark({ latenessMs: 0, idleTimeoutMs: 5000 });
    g.observePartition('p0', 1000, 0);
    g.observePartition('p1', 50000, 4000); // p1 seen recently
    expect(g.current()).toBe(1000);
    // p0 goes silent; at now=6000 it's idle → wm jumps to p1's max.
    expect(g.tick(6000)).toBe(50000);
    expect(g.activePartitions(6000)).toEqual(['p1']);
  });
});

describe('WindowStateStore', () => {
  let store: WindowStateStore<number, number, number>;

  beforeEach(() => {
    store = new WindowStateStore<number, number, number>(sumAggregator((n: number) => n));
  });

  it('folds incrementally into windows', () => {
    store.add('k', 0, 10_000, 100, 5, -1, 'drop');
    store.add('k', 0, 10_000, 200, 7, -1, 'drop');
    const peek = store.peek('k', 0);
    expect(peek!.value).toBe(12);
    expect(peek!.count).toBe(2);
  });

  it('expire emits fired windows and deletes state', () => {
    store.add('k', 0, 10_000, 100, 5, -1, 'drop');
    store.add('k', 10_000, 20_000, 10_500, 3, -1, 'drop');
    const fired = store.expire(10_000);
    expect(fired).toHaveLength(1);
    expect(fired[0].value).toBe(5);
    expect(store.openWindowCount()).toBe(1);
  });

  it('late records are dropped, side-output, or folded per policy', () => {
    store.add('k', 0, 10_000, 100, 5, -1, 'drop');
    // Watermark already past window end:
    const wm = 15_000;
    expect(store.add('k', 0, 10_000, 500, 9, wm, 'drop').fate).toBe('dropped');
    expect(store.add('k', 0, 10_000, 500, 9, wm, 'side-output').fate).toBe('side-output');
    expect(store.sideOutputs()).toHaveLength(1);
    expect(store.add('k', 0, 10_000, 500, 9, wm, 'accept').fate).toBe('folded');
    // 'accept' re-opened the window — now holds original + accepted.
    expect(store.peek('k', 0)!.value).toBe(14);
  });

  it('stateSnapshot/restore round-trips open windows', () => {
    store.add('k', 0, 10_000, 100, 5, -1, 'drop');
    store.add('j', 0, 10_000, 100, 8, -1, 'drop');
    const snap = store.stateSnapshot();
    const store2 = new WindowStateStore<number, number, number>(sumAggregator((n: number) => n));
    store2.restore(snap);
    expect(store2.peek('j', 0)!.value).toBe(8);
    expect(store2.openWindowCount()).toBe(2);
  });

  it('expireWithAccs salvages accumulators for retention', () => {
    store.add('k', 0, 10_000, 100, 5, -1, 'drop');
    const out = store.expireWithAccs(10_000);
    expect(out).toHaveLength(1);
    expect(out[0].result.value).toBe(5);
    expect(out[0].acc).toBe(5); // sum aggregator acc IS the number
  });
});

describe('ExactlyOnceSink', () => {
  let written: string[][];
  let sink: ExactlyOnceSink<string>;
  let sources: Map<string, SourceCursor>;

  beforeEach(() => {
    written = [];
    sink = new ExactlyOnceSink<string>((recs) => { written.push([...recs]); });
    sources = new Map([['input', new SourceCursor()]]);
  });

  it('records are buffered until a checkpoint commits', async () => {
    sink.write('a');
    sink.write('b');
    sources.get('input')!.advance(2);
    expect(written).toHaveLength(0);

    const snap = sink.prepareCommit(sources);
    expect(snap).not.toBeNull();
    expect(snap!.sourceOffsets.get('input')).toBe(2);
    expect(written).toHaveLength(0); // prepared but not committed

    await sink.commit(sources);
    expect(written).toEqual([['a', 'b']]);
    expect(sources.get('input')!.acked).toBe(2);
  });

  it('offsets are NOT acked when the txn is only prepared', async () => {
    sink.write('a');
    sources.get('input')!.advance(1);
    sink.prepareCommit(sources);
    // Crash before commit: offset stays unacked → records will replay.
    expect(sources.get('input')!.acked).toBe(0);
    // Recovery re-commits the pending txn.
    await sink.recover(sources);
    expect(written).toEqual([['a']]);
    expect(sources.get('input')!.acked).toBe(1);
  });

  it('abort restores records to the buffer for retry', async () => {
    sink.write('a');
    sink.write('b');
    sink.prepareCommit(sources);
    sink.abort();
    expect(sink.buffered).toBe(2);
    sink.prepareCommit(sources);
    await sink.commit(sources);
    expect(written).toEqual([['a', 'b']]);
  });

  it('prepareCommit returns null on an empty buffer', () => {
    expect(sink.prepareCommit(sources)).toBeNull();
  });
});

describe('LateDataRouter', () => {
  const win = tumblingWindows(10_000);
  const sum = () => sumAggregator((n: number) => n);

  function make(policy: 'drop' | 'side-output' | 'accept' | 'retract', allowedLatenessMs = 60_000) {
    const store = new WindowStateStore<number, number, number>(sum());
    const gen = new BoundedOutOfOrderness(0);
    const router = new LateDataRouter(store, win, gen, sum(), policy, { allowedLatenessMs });
    return { store, gen, router };
  }

  it('drop: late record vanishes, window result unchanged', () => {
    const { router } = make('drop');
    router.process('k', 1_000, 5);
    router.process('k', 25_000, 1); // wm=25000 → fires [0,10k)
    const r = router.process('k', 2_000, 9); // late for [0,10k)
    expect(r.action).toBe('dropped');
    // Window [0,10k) result stays 5 — proven via lastEmitted.
    expect(router.lastEmitted('k', 0)!.value).toBe(5);
  });

  it('side-output: late record diverted', () => {
    const { router, store } = make('side-output');
    router.process('k', 1_000, 5);
    router.process('k', 25_000, 1);
    const r = router.process('k', 2_000, 9);
    expect(r.action).toBe('side-output');
    expect(store.sideOutputs()).toHaveLength(1);
    expect(store.sideOutputs()[0].value).toBe(9);
  });

  it('accept: late record re-opens and immediately refires the window', () => {
    const { router } = make('accept');
    router.process('k', 1_000, 5);
    router.process('k', 25_000, 1); // fires [0,10k) → value 5
    const r = router.process('k', 2_000, 9);
    expect(r.action).toBe('folded');
    // The re-opened window refires in the same pass (already past wm),
    // containing only the accepted late record.
    const refired = r.fired.filter((f) => f.window.start === 0);
    expect(refired).toHaveLength(1);
    expect(refired[0].value).toBe(9);
  });

  it('retract: late record emits a corrected result on true state', () => {
    const { router } = make('retract', 60_000);
    router.process('k', 1_000, 5);
    const r1 = router.process('k', 11_000, 1); // wm=11000 → fires [0,10k) = 5
    expect(r1.fired.some((f) => f.window.start === 0 && f.value === 5)).toBe(true);

    const r2 = router.process('k', 2_000, 10); // late but within allowed lateness
    expect(r2.action).toBe('retracted');
    expect(r2.corrections).toHaveLength(1);
    expect(r2.corrections[0].value).toBe(15); // true acc 5 + late 10
    expect(router.lastEmitted('k', 0)!.value).toBe(15);
  });

  it('retract: beyond allowed lateness the record is side-output', () => {
    const { router } = make('retract', 5_000); // retention: window.end + 5s
    router.process('k', 1_000, 5);
    router.process('k', 11_000, 1);  // fires [0,10k), retained until wm >= 15k
    router.process('k', 30_000, 1);  // wm=30k > 15k → retention pruned
    const r = router.process('k', 2_000, 10);
    expect(r.action).toBe('side-output');
  });
});

describe('WindowedStreamJoin', () => {
  const win = tumblingWindows(10_000);

  function make(eager = true, retentionMs = 0) {
    const gen = new BoundedOutOfOrderness(0);
    return new WindowedStreamJoin<number, string>(win, gen, { retentionMs, eager });
  }

  it('emits pairs eagerly within the same window', () => {
    const j = make();
    j.left('k', 1_000, 1);
    const pairs = j.right('k', 2_000, 'r');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].left).toBe(1);
    expect(pairs[0].right).toBe('r');
  });

  it('cartesian product for multiple records on each side', () => {
    const j = make();
    j.left('k', 1_000, 1);
    j.left('k', 1_500, 2);
    const pairs = j.right('k', 2_000, 'r');
    expect(pairs).toHaveLength(2);
  });

  it('different keys do not match', () => {
    const j = make();
    j.left('a', 1_000, 1);
    expect(j.right('b', 1_000, 'r')).toHaveLength(0);
  });

  it('different windows do not match', () => {
    const j = make();
    j.left('k', 1_000, 1);
    expect(j.right('k', 15_000, 'r')).toHaveLength(0);
  });

  it('prunes buffers past watermark + retention and reports unmatched', () => {
    const j = make(true, 5_000);
    j.left('k', 1_000, 1);          // window [0,10k)
    j.right('k', 1_500, 'r');       // matches
    j.left('x', 2_000, 99);         // unmatched left in [0,10k)
    j.right('y', 3_000, 'orphan');  // unmatched right in [0,10k)

    // Push watermark beyond window end + retention.
    j.left('z', 20_000, 0); // wm=20000 → horizon=15000 → [0,10k) pruned
    const unmatched = j.drainUnmatched();
    const lefts = unmatched.filter((u) => u.side === 'left');
    const rights = unmatched.filter((u) => u.side === 'right');
    expect(lefts.some((u) => u.record === 99)).toBe(true);
    expect(rights.some((u) => u.record === 'orphan')).toBe(true);
    expect(j.openCellCount()).toBeLessThanOrEqual(1); // only the new window may remain
  });

  it('lazy mode emits the product only at prune time', () => {
    const j = make(false);
    j.left('k', 1_000, 1);
    expect(j.right('k', 2_000, 'r')).toHaveLength(0); // nothing yet
    j.left('z', 20_000, 0); // triggers prune
    const out = j.drain();
    expect(out.some((p) => p.left === 1 && p.right === 'r')).toBe(true);
  });
});
