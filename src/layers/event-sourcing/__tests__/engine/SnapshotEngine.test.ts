/**
 * Snapshot engine tests: store ordering/GC, versioned serialization with
 * migrations, scheduler triggers (count + bytes), rehydration shortcut.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { EventStore, NO_STREAM, ANY, StoredEvent } from '../../implementations/EventStore';
import {
  SnapshotStore,
  SnapshotSerializer,
  SnapshotScheduler,
  AggregateRehydrator,
  SnapshotMaintenance,
  eventSizeBytes,
} from '../../engine';

// --- A tiny domain fold: bank-account-like balance + operation count ---
interface AccountState {
  balance: number;
  ops: number;
}

const initial: AccountState = { balance: 0, ops: 0 };

function fold(state: AccountState, e: StoredEvent): AccountState {
  if (e.type === 'Deposited') {
    const d = e.data as { amount: number };
    return { balance: state.balance + d.amount, ops: state.ops + 1 };
  }
  if (e.type === 'Withdrawn') {
    const d = e.data as { amount: number };
    return { balance: state.balance - d.amount, ops: state.ops + 1 };
  }
  return state;
}

async function seed(store: EventStore, streamId: string, n: number): Promise<StoredEvent[]> {
  return store.appendToStream(
    streamId,
    n === 0 ? NO_STREAM : ANY,
    [] // never used
  ).catch(() => []);
}

async function appendDeposit(store: EventStore, streamId: string, amount: number): Promise<StoredEvent[]> {
  const exists = store.streamVersion(streamId) !== -1;
  return store.appendToStream(streamId, exists ? ANY : NO_STREAM, [
    { type: 'Deposited', data: { amount } },
  ]);
}

describe('SnapshotStore', () => {
  let store: SnapshotStore;

  beforeEach(() => {
    store = new SnapshotStore();
  });

  const rec = (streamId: string, v: number, state = '{}') => ({
    streamId,
    streamVersion: v,
    snapshotSchemaVersion: 1,
    stateJson: state,
    takenAt: 1000,
  });

  it('latest() returns the highest streamVersion', () => {
    store.save(rec('a', 10));
    store.save(rec('a', 30));
    store.save(rec('a', 20));
    expect(store.latest('a')!.streamVersion).toBe(30);
  });

  it('accepts out-of-order writes and stays sorted', () => {
    store.save(rec('a', 50));
    store.save(rec('a', 10));
    store.save(rec('a', 30));
    expect(store.history('a').map((r) => r.streamVersion)).toEqual([10, 30, 50]);
  });

  it('replaces a record at the same version', () => {
    store.save(rec('a', 10, '{"v":1}'));
    store.save(rec('a', 10, '{"v":2}'));
    expect(store.count('a')).toBe(1);
    expect(store.latest('a')!.stateJson).toBe('{"v":2}');
  });

  it('latestAtOrBefore picks the best lower bound', () => {
    for (const v of [10, 40, 90]) store.save(rec('a', v));
    expect(store.latestAtOrBefore('a', 45)!.streamVersion).toBe(40);
    expect(store.latestAtOrBefore('a', 90)!.streamVersion).toBe(90);
    expect(store.latestAtOrBefore('a', 5)).toBeNull();
  });

  it('garbageCollect keeps only the newest N per stream', () => {
    for (const v of [1, 2, 3, 4, 5]) store.save(rec('a', v));
    store.save(rec('b', 1));
    store.save(rec('b', 2));
    const dropped = store.garbageCollect(2);
    expect(dropped).toBe(3);
    expect(store.history('a').map((r) => r.streamVersion)).toEqual([4, 5]);
    expect(store.count('b')).toBe(2);
  });

  it('pruneBelow drops snapshots older than the truncation point', () => {
    for (const v of [5, 10, 20]) store.save(rec('a', v));
    // Snapshot at exactly V stays usable to rebuild at V; only < V is dropped.
    expect(store.pruneBelow('a', 10)).toBe(1);
    expect(store.history('a').map((r) => r.streamVersion)).toEqual([10, 20]);
    expect(store.pruneBelow('a', 20)).toBe(1);
    expect(store.history('a').map((r) => r.streamVersion)).toEqual([20]);
  });
});

describe('SnapshotSerializer', () => {
  it('round-trips a snapshot at the current schema version', () => {
    const ser = new SnapshotSerializer(1);
    const store = new SnapshotStore();
    const snap = { streamId: 'a', streamVersion: 7, state: { balance: 42, ops: 3 }, takenAt: 1 };
    ser.saveSnapshot(store, snap);
    const back = ser.loadLatest<AccountState>(store, 'a');
    expect(back).not.toBeNull();
    expect(back!.state.balance).toBe(42);
    expect(back!.streamVersion).toBe(7);
  });

  it('migrates an old-schema record through chained migrators', () => {
    const ser = new SnapshotSerializer(3);
    // v1: {cents} -> v2: {balance} -> v3: {balance, ops}
    ser.registerMigrator(1, (json) => {
      const s = JSON.parse(json) as { cents: number };
      return JSON.stringify({ balance: s.cents / 100 });
    });
    ser.registerMigrator(2, (json) => {
      const s = JSON.parse(json) as { balance: number };
      return JSON.stringify({ balance: s.balance, ops: 0 });
    });
    const store = new SnapshotStore();
    store.save({
      streamId: 'a',
      streamVersion: 5,
      snapshotSchemaVersion: 1,
      stateJson: JSON.stringify({ cents: 1500 }),
      takenAt: 1,
    });
    const back = ser.loadLatest<AccountState>(store, 'a');
    expect(back!.state).toEqual({ balance: 15, ops: 0 });
  });

  it('returns null when no migrator exists (caller falls back to replay)', () => {
    const ser = new SnapshotSerializer(2);
    const store = new SnapshotStore();
    store.save({ streamId: 'a', streamVersion: 5, snapshotSchemaVersion: 1, stateJson: '{}', takenAt: 1 });
    expect(ser.loadLatest(store, 'a')).toBeNull();
  });

  it('returns null for a newer-than-known schema version', () => {
    const ser = new SnapshotSerializer(1);
    const store = new SnapshotStore();
    store.save({ streamId: 'a', streamVersion: 5, snapshotSchemaVersion: 9, stateJson: '{}', takenAt: 1 });
    expect(ser.loadLatest(store, 'a')).toBeNull();
  });
});

describe('SnapshotScheduler', () => {
  it('triggers every N events and resets on confirm', () => {
    const sched = new SnapshotScheduler({ everyNEvents: 3 });
    const ev = (v: number): StoredEvent => ({
      id: `e${v}`, streamId: 'a', streamVersion: v, globalPosition: v,
      type: 'Deposited', schemaVersion: 1, data: { amount: 1 }, metadata: {}, timestamp: 0,
    });
    expect(sched.eventsAppended('a', [ev(0), ev(1)])).toBe(false);
    expect(sched.eventsAppended('a', [ev(2)])).toBe(true);
    sched.confirmSnapshot('a', 2);
    expect(sched.isDue('a')).toBe(false);
    expect(sched.eventsAppended('a', [ev(3), ev(4), ev(5)])).toBe(true);
  });

  it('triggers on accumulated bytes even below the count threshold', () => {
    const sched = new SnapshotScheduler({ everyNEvents: 1000, maxBytesSinceSnapshot: 100 });
    const big: StoredEvent = {
      id: 'x', streamId: 'a', streamVersion: 0, globalPosition: 0,
      type: 'Deposited', schemaVersion: 1,
      data: { amount: 1, memo: 'z'.repeat(500) }, metadata: {}, timestamp: 0,
    };
    expect(sched.eventsAppended('a', [big])).toBe(true);
  });

  it('respects minEventsBeforeFirst', () => {
    const sched = new SnapshotScheduler({ everyNEvents: 1, minEventsBeforeFirst: 5 });
    const ev: StoredEvent = {
      id: 'e', streamId: 'a', streamVersion: 0, globalPosition: 0,
      type: 'Deposited', schemaVersion: 1, data: {}, metadata: {}, timestamp: 0,
    };
    expect(sched.eventsAppended('a', [ev])).toBe(false);
    expect(sched.eventsAppended('a', [ev, ev, ev, ev])).toBe(true);
  });

  it('stays due if the snapshot was never confirmed (retry-safe)', () => {
    const sched = new SnapshotScheduler({ everyNEvents: 1 });
    const ev: StoredEvent = {
      id: 'e', streamId: 'a', streamVersion: 0, globalPosition: 0,
      type: 'Deposited', schemaVersion: 1, data: {}, metadata: {}, timestamp: 0,
    };
    expect(sched.eventsAppended('a', [ev])).toBe(true);
    // No confirmSnapshot: still due.
    expect(sched.isDue('a')).toBe(true);
  });
});

describe('AggregateRehydrator', () => {
  let store: EventStore;
  let snaps: SnapshotStore;
  let ser: SnapshotSerializer;
  let reh: AggregateRehydrator;

  beforeEach(() => {
    store = new EventStore();
    snaps = new SnapshotStore();
    ser = new SnapshotSerializer(1);
    reh = new AggregateRehydrator(store, snaps, ser);
  });

  it('full-replays when no snapshot exists', async () => {
    await appendDeposit(store, 'a', 10);
    await appendDeposit(store, 'a', 5);
    const r = reh.load('a', initial, fold);
    expect(r.path).toBe('full-replay');
    expect(r.eventsReplayed).toBe(2);
    expect(r.state).toEqual({ balance: 15, ops: 2 });
  });

  it('uses the snapshot and replays only the tail', async () => {
    await appendDeposit(store, 'a', 10);
    await appendDeposit(store, 'a', 20);
    reh.snapshotNow('a', initial, fold); // snapshot at v1, balance=30

    await appendDeposit(store, 'a', 5); // v2
    await appendDeposit(store, 'a', 7); // v3

    const r = reh.load('a', initial, fold);
    expect(r.path).toBe('snapshot+tail');
    expect(r.snapshotUsed!.streamVersion).toBe(1);
    expect(r.eventsReplayed).toBe(2);
    expect(r.state).toEqual({ balance: 42, ops: 4 });
  });

  it('falls back to full replay when the snapshot cannot be migrated', async () => {
    await appendDeposit(store, 'a', 10);
    await appendDeposit(store, 'a', 20);
    reh.snapshotNow('a', initial, fold);
    // Corrupt the stored record: schema version nobody can read.
    snaps.save({ streamId: 'a', streamVersion: 1, snapshotSchemaVersion: 99, stateJson: '{}', takenAt: 0 });
    const r = reh.load('a', initial, fold);
    expect(r.path).toBe('full-replay');
    expect(r.state.balance).toBe(30);
  });

  it('scheduler + rehydrator: snapshot taken automatically when due', async () => {
    const sched = new SnapshotScheduler({ everyNEvents: 2 });
    const r2 = new AggregateRehydrator(store, snaps, ser, sched);
    for (let i = 0; i < 5; i++) {
      const evts = await appendDeposit(store, 'a', 1);
      r2.eventsAppended('a', evts, initial, fold);
    }
    // Snapshots taken at v1 and v3.
    expect(snaps.count('a')).toBe(2);
    expect(snaps.latest('a')!.streamVersion).toBe(3);
  });

  it('loadAt rebuilds a point-in-time state', async () => {
    await appendDeposit(store, 'a', 100); // v0
    await appendDeposit(store, 'a', 50);  // v1
    await appendDeposit(store, 'a', 25);  // v2
    const r = reh.loadAt('a', 1, initial, fold);
    expect(r.state.balance).toBe(150);
    expect(r.streamVersion).toBe(1);
  });

  it('returns empty for a missing stream', () => {
    const r = reh.load('ghost', initial, fold);
    expect(r.path).toBe('empty');
    expect(r.streamVersion).toBe(-1);
  });
});

describe('SnapshotMaintenance', () => {
  it('reports per-stream stats and detects missing snapshots', async () => {
    const store = new EventStore();
    const snaps = new SnapshotStore();
    const sched = new SnapshotScheduler({ everyNEvents: 3 });
    const reh = new AggregateRehydrator(store, snaps, ser_of(), sched);
    const maint = new SnapshotMaintenance(store, snaps, sched);

    for (let i = 0; i < 4; i++) {
      const evts = await appendDeposit(store, 'a', 1);
      reh.eventsAppended('a', evts, initial, fold);
    }
    for (let i = 0; i < 2; i++) await appendDeposit(store, 'cold', 1);

    const rep = maint.report();
    expect(rep).toHaveLength(1);
    expect(rep[0].streamId).toBe('a');
    expect(rep[0].snapshots).toBe(1); // taken at v2 (3rd event)
    expect(rep[0].eventsSinceSnapshot).toBe(1); // only v3 since the snapshot

    expect(maint.streamsMissingSnapshots(['a', 'cold'], 2)).toEqual(['cold']);
    expect(maint.collectGarbage(1)).toBe(0);
  });
});

function ser_of(): SnapshotSerializer {
  return new SnapshotSerializer(1);
}

describe('eventSizeBytes', () => {
  it('grows with payload size', () => {
    const small: StoredEvent = {
      id: 'a', streamId: 's', streamVersion: 0, globalPosition: 0,
      type: 'X', schemaVersion: 1, data: {}, metadata: {}, timestamp: 0,
    };
    const big = { ...small, data: { blob: 'y'.repeat(1000) } };
    expect(eventSizeBytes(big)).toBeGreaterThan(eventSizeBytes(small) + 900);
  });
});
