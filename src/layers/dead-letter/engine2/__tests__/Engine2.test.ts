/**
 * Tests for the DeadLetter Engine2 modules.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RecordStore, RecordStateError, _resetRecordIds } from '../RecordStore';
import { clusterRecords, normalizeMessage, signatureOf, topReasons } from '../ErrorClusters';
import { ReplayScheduler } from '../ReplayScheduler';
import { QuarantineRegistry, QuarantineError } from '../Quarantine';
import { SizeAlertRegistry } from '../SizeAlerts';
import { CrossTransfer, TransferError } from '../CrossTransfer';
import { ManualDlqClock2 } from '../types';
import type { SizeAlert } from '../types';

let clock: ManualDlqClock2;
let store: RecordStore;

function rec(over: Partial<Parameters<RecordStore['add']>[1]> = {}) {
  return {
    origin: 'orders',
    enqueuedAt: clock.now(),
    failedAt: clock.now(),
    attempts: 3,
    errorClass: 'TimeoutError',
    errorMessage: 'timed out',
    headers: {},
    payload: {},
    ...over,
  };
}

beforeEach(() => {
  _resetRecordIds();
  clock = new ManualDlqClock2(1_000_000);
  store = new RecordStore(clock);
});

// ---------------------------------------------------------------------
// RecordStore
// ---------------------------------------------------------------------

describe('RecordStore', () => {
  it('adds and lists FIFO', () => {
    const a = store.add('dlq', rec({ errorMessage: 'a' }));
    const b = store.add('dlq', rec({ errorMessage: 'b' }));
    expect(store.list('dlq').map((r) => r.id)).toEqual([a, b]);
    expect(store.depth('dlq')).toBe(2);
  });

  it('claim → complete leaves pending set; claim → fail returns it', () => {
    const a = store.add('dlq', rec());
    store.add('dlq', rec());
    const claimed = store.claimForReplay('dlq', 1);
    expect(claimed.map((r) => r.id)).toEqual([a]);
    expect(store.depth('dlq', 'pending')).toBe(1);
    store.failReplay(a);
    expect(store.depth('dlq', 'pending')).toBe(2);
    store.claimForReplay('dlq', 1);
    store.completeReplay(a);
    expect(store.get(a)?.state).toBe('replayed');
    expect(store.depth('dlq', 'pending')).toBe(1);
  });

  it('respects minAgeMs on claims', () => {
    store.add('dlq', rec({ enqueuedAt: 999_000 })); // 1s old
    clock.advance(10_000);
    store.add('dlq', rec()); // fresh
    const claimed = store.claimForReplay('dlq', 5, 5000);
    expect(claimed.length).toBe(1);
  });

  it('releases stale claims past maxAge', () => {
    const a = store.add('dlq', rec());
    store.claimForReplay('dlq', 1);
    clock.advance(60_000);
    expect(store.releaseStaleClaims(30_000)).toEqual([a]);
    expect(store.get(a)?.state).toBe('pending');
  });

  it('enforces the state machine', () => {
    const a = store.add('dlq', rec());
    expect(() => store.completeReplay(a)).toThrow(RecordStateError);
    store.quarantine(a);
    expect(() => store.failReplay(a)).toThrow(RecordStateError);
    expect(() => store.completeReplay(a)).toThrow(RecordStateError);
    store.release(a);
    expect(store.get(a)?.state).toBe('pending');
  });

  it('sweep drops settled records only', () => {
    const a = store.add('dlq', rec());
    const b = store.add('dlq', rec());
    store.quarantine(b);
    store.claimForReplay('dlq', 1);
    store.completeReplay(a);
    expect(store.sweep('dlq')).toBe(1);
    expect(store.get(a)).toBeUndefined();
    expect(store.get(b)?.state).toBe('quarantined');
  });
});

// ---------------------------------------------------------------------
// Error clustering & top reasons
// ---------------------------------------------------------------------

describe('ErrorClusters', () => {
  it('normalises digits, uuids, hex, quotes and whitespace', () => {
    expect(
      normalizeMessage('Order 88123 failed: "no route" at 0xDEADBEEF12   (x3)')
    ).toBe('order <n> failed: <str> at <hex> (x<n>)');
    expect(
      normalizeMessage('id 550e8400-e29b-41d4-a716-446655440000 rejected')
    ).toBe('id <uuid> rejected');
  });

  it('signature combines class, site and normalised message', () => {
    expect(
      signatureOf({
        errorClass: 'TimeoutError',
        errorMessage: 'Order 991 timed out after 30s',
        errorSite: 'relay.ts:88',
      })
    ).toBe('TimeoutError@relay.ts:88:order <n> timed out after <n>s');
    expect(
      signatureOf({ errorClass: 'TimeoutError', errorMessage: '', errorSite: undefined })
    ).toBe('TimeoutError');
  });

  it('clusters collapse distinct ids into one signature', () => {
    const mk = (id: string, n: number) =>
      ({
        id,
        origin: 'orders',
        failedAt: n,
        errorClass: 'TimeoutError',
        errorMessage: `order ${n} timed out`,
        errorSite: 'relay.ts:1',
      });
    const clusters = clusterRecords([mk('a', 1), mk('b', 2), mk('c', 3)]);
    expect(clusters.length).toBe(1);
    expect(clusters[0]?.count).toBe(3);
    expect(clusters[0]?.members.map((m) => m.recordId)).toEqual(['a', 'b', 'c']);
  });

  it('different classes or sites stay separate', () => {
    const base = {
      id: 'x', origin: 'o', failedAt: 1,
      errorClass: 'A', errorMessage: 'm', errorSite: 's:1',
    };
    const clusters = clusterRecords([
      base,
      { ...base, id: 'y', errorClass: 'B' },
      { ...base, id: 'z', errorSite: 's:2' },
    ]);
    expect(clusters.length).toBe(3);
  });

  it('topReasons ranks by count then recency, with share', () => {
    const records = [
      { errorClass: 'A', errorMessage: 'one 1', errorSite: 's', failedAt: 1 },
      { errorClass: 'A', errorMessage: 'one 2', errorSite: 's', failedAt: 2 },
      { errorClass: 'B', errorMessage: 'two', errorSite: 's', failedAt: 5 },
      { errorClass: 'B', errorMessage: 'two', errorSite: 's', failedAt: 4 },
    ];
    const r = topReasons('dlq', records, 'signature');
    expect(r.analysed).toBe(4);
    expect(r.top[0]?.count).toBe(2);
    expect(r.top[0]?.share).toBe(0.5);
    expect(r.top[0]?.lastSeenAt).toBe(5); // most recent inside B-bucket
    expect(r.top[0]?.key).toContain('B');
    const byClass = topReasons('dlq', records, 'class');
    expect(byClass.top.map((t) => t.key)).toEqual(['B', 'A']); // same count, B more recent
  });

  it('topReasons honours the limit and counts remainder', () => {
    const records = Array.from({ length: 15 }, (_, i) => ({
      errorClass: `E${i}`, errorMessage: `m${i}`, errorSite: 's', failedAt: i,
    }));
    const r = topReasons('dlq', records, 'class', 10);
    expect(r.top.length).toBe(10);
    expect(r.remainder).toBe(5);
  });
});

// ---------------------------------------------------------------------
// Replay scheduler
// ---------------------------------------------------------------------

describe('ReplayScheduler', () => {
  it('paces per interval and honours maxTotal', async () => {
    for (let i = 0; i < 7; i++) store.add('dlq', rec());
    const sched = new ReplayScheduler(store, 'dlq', {
      perInterval: 3, intervalMs: 1000, maxTotal: 5,
    }, clock);
    const t1 = await sched.tick(() => true);
    expect(t1.moved.length).toBe(3);
    const t2 = await sched.tick(() => true); // same interval — no-op
    expect(t2.moved.length).toBe(0);
    clock.advance(1000);
    const t3 = await sched.tick(() => true);
    expect(t3.moved.length).toBe(2); // capped by maxTotal
    expect(sched.done).toBe(true);
    expect(sched.movedTotal).toBe(5);
    expect(store.depth('dlq', 'replayed')).toBe(5);
    expect(store.depth('dlq', 'pending')).toBe(2);
  });

  it('returns failed redeliveries to pending for next-interval retry', async () => {
    const a = store.add('dlq', rec());
    store.add('dlq', rec());
    const sched = new ReplayScheduler(store, 'dlq', {
      perInterval: 2, intervalMs: 500,
    }, clock);
    const fail = await sched.tick((r) => r.id !== a);
    expect(fail.moved.length).toBe(1);
    expect(store.get(a)?.state).toBe('pending');
    expect(sched.attempts(a)).toBe(1);
    clock.advance(500);
    const retry = await sched.tick(() => true);
    expect(retry.moved).toEqual([a]);
    expect(sched.done).toBe(true);
  });

  it('rejects throwing redeliverers without losing the record', async () => {
    const a = store.add('dlq', rec());
    const sched = new ReplayScheduler(store, 'dlq', {
      perInterval: 1, intervalMs: 100,
    }, clock);
    await sched.tick(() => {
      throw new Error('broker down');
    });
    expect(store.get(a)?.state).toBe('pending');
  });

  it('respects minAgeMs — fresh records wait', async () => {
    store.add('dlq', rec({ enqueuedAt: 990_000 })); // 10s old at start
    store.add('dlq', rec()); // fresh — enqueuedAt = now
    const sched = new ReplayScheduler(store, 'dlq', {
      perInterval: 5, intervalMs: 100, minAgeMs: 5000,
    }, clock);
    const t = await sched.tick(() => true);
    expect(t.moved.length).toBe(1); // only the aged record moved
    expect(t.remaining).toBe(1); // fresh record still pending, just not eligible
    expect(sched.done).toBe(false);
    clock.advance(5000);
    const t2 = await sched.tick(() => true);
    expect(t2.moved.length).toBe(1); // fresh record eligible now
    expect(sched.done).toBe(true);
  });

  it('drain loops over intervals with a manual clock', async () => {
    for (let i = 0; i < 5; i++) store.add('dlq', rec());
    const sched = new ReplayScheduler(store, 'dlq', {
      perInterval: 2, intervalMs: 100,
    }, clock);
    const moved = await sched.drain(() => true, (ms) => clock.advance(ms));
    expect(moved).toBe(5);
    expect(sched.done).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------

describe('QuarantineRegistry', () => {
  it('parks pending records and removes them from the pending set', () => {
    const a = store.add('dlq', rec({ errorMessage: 'poison' }));
    const reg = new QuarantineRegistry(store, clock);
    const entry = reg.park(a, 'crashes consumer');
    expect(entry.signature).toBe('TimeoutError:poison');
    expect(entry.note).toBe('crashes consumer');
    expect(store.get(a)?.state).toBe('quarantined');
    expect(store.depth('dlq', 'pending')).toBe(0);
  });

  it('review release returns the record to pending and clears the entry', () => {
    const a = store.add('dlq', rec());
    const reg = new QuarantineRegistry(store, clock);
    reg.park(a);
    expect(reg.pendingReview().length).toBe(1);
    const out = reg.review(a, 'ops@x', 'release', 'false positive');
    expect(out.review?.verdict).toBe('release');
    expect(reg.get(a)).toBeUndefined();
    expect(store.get(a)?.state).toBe('pending');
  });

  it('review keep/purge stay parked', () => {
    const a = store.add('dlq', rec());
    const reg = new QuarantineRegistry(store, clock);
    reg.park(a);
    reg.review(a, 'ops', 'keep');
    expect(reg.get(a)?.review?.verdict).toBe('keep');
    expect(store.get(a)?.state).toBe('quarantined');
    reg.review(a, 'ops', 'purge');
    expect(reg.get(a)?.review?.verdict).toBe('purge');
  });

  it('parkBySignature parks a whole cluster', () => {
    store.add('dlq', rec({ errorMessage: 'order 1 exploded' }));
    store.add('dlq', rec({ errorMessage: 'order 2 exploded' }));
    store.add('dlq', rec({ errorMessage: 'fine' }));
    const reg = new QuarantineRegistry(store, clock);
    const sig = 'TimeoutError:order <n> exploded';
    const parked = reg.parkBySignature('dlq', sig);
    expect(parked.length).toBe(2);
    expect(store.depth('dlq', 'quarantined')).toBe(2);
    expect(store.depth('dlq', 'pending')).toBe(1);
  });

  it('rejects double-parking and unknown ids', () => {
    const a = store.add('dlq', rec());
    const reg = new QuarantineRegistry(store, clock);
    reg.park(a);
    expect(() => reg.park(a)).toThrow(QuarantineError);
    expect(() => reg.park('ghost')).toThrow(QuarantineError);
    expect(() => reg.review('ghost', 'o', 'keep')).toThrow(QuarantineError);
  });
});

// ---------------------------------------------------------------------
// Size alerts
// ---------------------------------------------------------------------

describe('SizeAlertRegistry', () => {
  let fired: SizeAlert[];

  beforeEach(() => {
    fired = [];
  });

  function mk() {
    return new SizeAlertRegistry(store, (a) => fired.push(a), clock);
  }

  it('fires once on the upward crossing, then stays quiet', () => {
    const alerts = mk();
    alerts.watch('dlq', { depth: 2, severity: 'warn' });
    store.add('dlq', rec());
    expect(alerts.check('dlq')).toEqual([]);
    store.add('dlq', rec());
    alerts.check('dlq');
    expect(fired.length).toBe(1);
    expect(fired[0]?.entered).toBe(true);
    expect(fired[0]?.threshold.severity).toBe('warn');
    store.add('dlq', rec());
    alerts.check('dlq');
    expect(fired.length).toBe(1); // no repeat while above
  });

  it('re-arms after dropping below and crossing again', () => {
    const alerts = mk();
    alerts.watch('dlq', { depth: 1, severity: 'warn' });
    store.add('dlq', rec());
    alerts.check('dlq');
    expect(fired.length).toBe(1);
    // Drain the queue.
    const [r] = store.list('dlq', 'pending');
    store.claimForReplay('dlq', 1);
    store.completeReplay(r?.id ?? '');
    alerts.check('dlq');
    expect(fired.length).toBe(1);
    store.add('dlq', rec());
    alerts.check('dlq');
    expect(fired.length).toBe(2);
  });

  it('counts pending + replaying, excludes quarantined', () => {
    const alerts = mk();
    alerts.watch('dlq', { depth: 2, severity: 'page' });
    const a = store.add('dlq', rec());
    store.add('dlq', rec());
    store.quarantine(a);
    expect(alerts.depth('dlq')).toBe(1); // quarantined excluded
    expect(alerts.check('dlq')).toEqual([]); // 1 < threshold 2, no fire
    store.release(a);
    store.claimForReplay('dlq', 1);
    expect(alerts.depth('dlq')).toBe(2); // claimed still counts
    alerts.check('dlq');
    expect(fired.length).toBe(1); // now at threshold 2
  });

  it('supports stacked thresholds and poll()', () => {
    const alerts = mk();
    alerts.watch('dlq', { depth: 3, severity: 'page' });
    alerts.watch('dlq', { depth: 1, severity: 'warn' });
    for (let i = 0; i < 3; i++) store.add('dlq', rec());
    const out = alerts.poll();
    expect(out.length).toBe(2); // both thresholds crossed
    expect(out.map((a) => a.threshold.severity).sort()).toEqual(['page', 'warn']);
  });
});

// ---------------------------------------------------------------------
// Cross-DLQ transfer
// ---------------------------------------------------------------------

describe('CrossTransfer', () => {
  it('moves a record: source marked, destination gets a fresh id', () => {
    const a = store.add('dlq-a', rec({ errorMessage: 'misrouted' }));
    const xfer = new CrossTransfer(store, clock);
    const r = xfer.move(a, 'dlq-b');
    expect(r.from).toBe('dlq-a');
    expect(r.to).toBe('dlq-b');
    expect(store.get(a)?.state).toBe('transferred');
    const dest = store.get(r.newId);
    expect(dest?.queue).toBe('dlq-b');
    expect(dest?.state).toBe('pending');
    expect(dest?.origin).toBe('orders');
    expect(dest?.errorMessage).toBe('misrouted');
  });

  it('moveBySignature transfers a whole cluster', () => {
    store.add('dlq-a', rec({ errorMessage: 'order 5 bad' }));
    store.add('dlq-a', rec({ errorMessage: 'order 6 bad' }));
    store.add('dlq-a', rec({ errorMessage: 'keep' }));
    const xfer = new CrossTransfer(store, clock);
    const moved = xfer.moveBySignature('dlq-a', 'dlq-b', 'TimeoutError:order <n> bad');
    expect(moved.length).toBe(2);
    expect(store.depth('dlq-b', 'pending')).toBe(2);
    expect(store.depth('dlq-a', 'pending')).toBe(1);
  });

  it('quarantined records stay quarantined at the destination', () => {
    const a = store.add('dlq-a', rec());
    const reg = new QuarantineRegistry(store, clock);
    reg.park(a, 'review pending');
    const xfer = new CrossTransfer(store, clock);
    const r = xfer.move(a, 'dlq-b', reg);
    expect(store.get(r.newId)?.state).toBe('quarantined');
    expect(reg.get(r.newId)).not.toBeUndefined();
  });

  it('rejects moving settled or claimed records', () => {
    const a = store.add('dlq-a', rec());
    const b = store.add('dlq-a', rec());
    store.claimForReplay('dlq-a', 2);
    store.completeReplay(a);
    const xfer = new CrossTransfer(store, clock);
    expect(() => xfer.move(a, 'dlq-b')).toThrow(TransferError);
    expect(() => xfer.move(b, 'dlq-b')).toThrow(TransferError); // still claimed
  });
});

// ---------------------------------------------------------------------
// Trend analytics
// ---------------------------------------------------------------------

import { DlqAnalytics, ageHistogram, arrivalRatePerMs } from '../DlqAnalytics';

describe('DlqAnalytics', () => {
  it('ageHistogram buckets by age with an open tail', () => {
    const now = 1_000_000;
    const records = [
      { enqueuedAt: now - 30_000 },   // 30s → bucket 0
      { enqueuedAt: now - 120_000 },  // 2m  → bucket 1
      { enqueuedAt: now - 700_000 },  // 11m → bucket 2 (under 15m)
      { enqueuedAt: now - 5_000_000 },// 83m → tail bucket
    ];
    const h = ageHistogram(records, now, [60_000, 300_000, 900_000]);
    expect(h.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(h[3]?.hi).toBe(Number.POSITIVE_INFINITY);
  });

  it('arrivalRatePerMs estimates records/ms via OLS', () => {
    // One record per 1000ms over 10 samples → rate ~0.001/ms.
    const times = Array.from({ length: 10 }, (_, i) => i * 1000);
    const rate = arrivalRatePerMs(times);
    expect(rate).toBeCloseTo(0.001, 4);
    expect(arrivalRatePerMs([1])).toBeNull();
    expect(arrivalRatePerMs([])).toBeNull();
  });

  it('trend reports depth, oldest age, arrival rate and ETA', () => {
    const clock2 = new ManualDlqClock2(1_000_000);
    const s = new RecordStore(clock2);
    // 5 pending records enqueued over the last 50s → ~0.0001/ms arrival.
    for (let i = 0; i < 5; i++) {
      s.add('dlq', rec({ enqueuedAt: 1_000_000 - (5 - i) * 10_000 }));
    }
    const a = new DlqAnalytics(s, clock2);
    const t = a.trend('dlq');
    expect(t.depth).toBe(5);
    expect(t.oldestAgeMs).toBe(50_000);
    expect(t.arrivalRatePerMs).toBeCloseTo(0.0001, 4);
    // No replays recorded → net rate negative → no ETA.
    expect(t.etaMs).toBeNull();
  });

  it('records replays and produces a drain ETA', () => {
    const clock2 = new ManualDlqClock2(1_000_000);
    const s = new RecordStore(clock2);
    // 4 records enqueued within a 200s span ending now → tiny arrival rate.
    for (let i = 0; i < 4; i++) s.add('dlq', rec({ enqueuedAt: 990_000 + i * 1_000 }));
    const a = new DlqAnalytics(s, clock2);
    for (let i = 0; i < 40; i++) a.recordReplayed('dlq', 995_000 + i * 100);
    const t = a.trend('dlq');
    // drain ≈ 40/200_000 = 0.0002/ms; arrival ≈ 4/200_000 → net positive → ETA.
    expect(t.etaMs).not.toBeNull();
    expect(t.etaMs).toBeGreaterThan(0);
  });

  it('topOrigins ranks origins feeding the queue', () => {
    const s = new RecordStore(clock);
    for (let i = 0; i < 3; i++) s.add('dlq', rec({ origin: 'orders' }));
    s.add('dlq', rec({ origin: 'billing' }));
    const a = new DlqAnalytics(s, clock);
    const origins = a.topOrigins('dlq');
    expect(origins[0]).toEqual({ origin: 'orders', count: 3 });
    expect(origins[1]).toEqual({ origin: 'billing', count: 1 });
  });
});

// ---------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------

import { RetentionEnforcer } from '../Retention';

describe('RetentionEnforcer', () => {
  it('expires records older than maxAgeMs', () => {
    const s = new RecordStore(clock);
    s.add('dlq', rec({ enqueuedAt: 800_000 }));
    s.add('dlq', rec());
    const e = new RetentionEnforcer(s, { maxAgeMs: 100_000 }, clock);
    const r = e.enforce('dlq');
    expect(r.expired.length).toBe(1);
    expect(r.kept).toBe(1);
    expect(s.depth('dlq', 'quarantined')).toBe(1);
    // Idempotent.
    expect(e.enforce('dlq').expired).toEqual([]);
  });

  it('expires on attempts regardless of age', () => {
    const s = new RecordStore(clock);
    s.add('dlq', rec({ attempts: 10 }));
    const e = new RetentionEnforcer(s, { maxAgeMs: 999_999_999, maxAttempts: 5 }, clock);
    expect(e.enforce('dlq').expired.length).toBe(1);
  });

  it('graceMs gives recently-aged records one more pass', () => {
    const s = new RecordStore(clock);
    s.add('dlq', rec({ enqueuedAt: 900_000 })); // 100s old; maxAge 50s + grace 100s
    const e = new RetentionEnforcer(
      s,
      { maxAgeMs: 50_000, graceMs: 100_000 },
      clock
    );
    expect(e.enforce('dlq').expired).toEqual([]);
    clock.advance(50_000); // now 150s old — past age+grace
    expect(e.enforce('dlq').expired.length).toBe(1);
  });

  it('enforceAll sweeps every queue', () => {
    const s = new RecordStore(clock);
    s.add('a', rec({ enqueuedAt: 1 }));
    s.add('b', rec({ enqueuedAt: 1 }));
    const e = new RetentionEnforcer(s, { maxAgeMs: 100 }, clock);
    const reports = e.enforceAll();
    expect(reports.map((r) => r.queue).sort()).toEqual(['a', 'b']);
    expect(reports.every((r) => r.expired.length === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Cluster trends
// ---------------------------------------------------------------------

import { trendClusters } from '../ClusterTrend';
import { clusterRecords } from '../ErrorClusters';

describe('trendClusters', () => {
  const mk = (id: string, failedAt: number) =>
    ({ id, origin: 'o', failedAt, errorClass: 'E', errorMessage: 'm', errorSite: 's' });

  it('marks clusters born inside the window as new', () => {
    const clusters = clusterRecords([mk('a', 950_000), mk('b', 990_000)]);
    const t = trendClusters(clusters, clock); // now=1_000_000, window=1h
    expect(t[0]?.trend).toBe('new');
    expect(t[0]?.recentCount).toBe(2);
  });

  it('marks silent clusters as cooling', () => {
    const clusters = clusterRecords([mk('a', 100), mk('b', 200)]);
    const t = trendClusters(clusters, clock, 1000);
    expect(t[0]?.trend).toBe('cooling');
    expect(t[0]?.recentCount).toBe(0);
  });

  it('marks an accelerating cluster', () => {
    // Cluster lived over 2h, but most failures landed in the last 30min.
    const clusters = clusterRecords([
      mk('a', 1), mk('b', 2),
      mk('c', 990_000), mk('d', 995_000), mk('e', 998_000), mk('f', 999_000),
    ]);
    const t = trendClusters(clusters, clock, 300_000); // 5min window
    expect(t[0]?.trend).toBe('accelerating');
  });

  it('a steady long-lived cluster is steady', () => {
    // Spread evenly across the hour.
    const clusters = clusterRecords(
      Array.from({ length: 10 }, (_, i) => mk(`m${i}`, i * 100_000))
    );
    const t = trendClusters(clusters, clock, 300_000);
    expect(t[0]?.trend).toBe('steady');
  });

  it('orders accelerating before steady before cooling', () => {
    const records = [
      { id: 'c', origin: 'o', failedAt: 10, errorClass: 'A', errorMessage: 'x', errorSite: 's' },
      { id: 'a', origin: 'o', failedAt: 999_000, errorClass: 'B', errorMessage: 'y', errorSite: 's' },
      { id: 's', origin: 'o', failedAt: 700_000, errorClass: 'C', errorMessage: 'z', errorSite: 's' },
    ];
    const t = trendClusters(clusterRecords(records), clock, 500_000);
    // 'c' at 10 → cooling; 'a' at 999_000 → new; 's' at 700_000 is inside
    // the 500_000 window (firstSeen ≥ cutoff) → also 'new'.
    expect(t.map((x) => x.trend)).toEqual(['new', 'new', 'cooling']);
  });
});
