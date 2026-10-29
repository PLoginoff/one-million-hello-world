/**
 * EventStore + Projection Engine Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  EventStore,
  EventSourcedAggregate,
  AggregateRepository,
  ConcurrencyError,
  StreamNotFoundError,
  ANY,
  NO_STREAM,
  STREAM_EXISTS,
  type StoredEvent,
} from '../implementations/EventStore';
import { ProjectionManager, type IProjection } from '../implementations/Projection';

// ---------------------------------------------------------------- bank account

interface AccountState {
  balance: number;
  owner: string;
}

class BankAccount extends EventSourcedAggregate<AccountState> {
  private _balance = 0;
  private _owner = '';

  static open(id: string, owner: string, initial: number): BankAccount {
    const a = new BankAccount(id);
    a.raise('AccountOpened', { owner, balance: initial });
    return a;
  }

  deposit(amount: number): void {
    this.raise('Deposited', { amount });
  }

  withdraw(amount: number): void {
    if (amount > this._balance) throw new Error('insufficient funds');
    this.raise('Withdrawn', { amount });
  }

  get balance(): number {
    return this._balance;
  }

  protected apply(data: unknown, type: string): void {
    const d = data as { amount?: number; owner?: string; balance?: number };
    switch (type) {
      case 'AccountOpened':
        this._owner = d.owner ?? '';
        this._balance = d.balance ?? 0;
        break;
      case 'Deposited':
        this._balance += d.amount ?? 0;
        break;
      case 'Withdrawn':
        this._balance -= d.amount ?? 0;
        break;
    }
  }

  captureSnapshot(): AccountState {
    return { balance: this._balance, owner: this._owner };
  }

  protected restoreSnapshot(state: AccountState): void {
    this._balance = state.balance;
    this._owner = state.owner;
  }
}

// --------------------------------------------------------------------- tests

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  it('appends events and assigns stream versions + global positions', async () => {
    const evs = await store.appendToStream('a1', NO_STREAM, [
      { type: 'E1', data: { n: 1 } },
      { type: 'E2', data: { n: 2 } },
    ]);
    expect(evs).toHaveLength(2);
    expect(evs[0].streamVersion).toBe(0);
    expect(evs[1].streamVersion).toBe(1);
    expect(evs[0].globalPosition).toBe(0);
    expect(evs[1].globalPosition).toBe(1);
    expect(store.streamVersion('a1')).toBe(1);
    expect(store.globalPosition).toBe(2);
  });

  it('enforces NO_STREAM sentinel', async () => {
    await store.appendToStream('a1', NO_STREAM, [{ type: 'E', data: 1 }]);
    await expect(
      store.appendToStream('a1', NO_STREAM, [{ type: 'E', data: 2 }])
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it('enforces STREAM_EXISTS sentinel', async () => {
    await expect(
      store.appendToStream('missing', STREAM_EXISTS, [{ type: 'E', data: 1 }])
    ).rejects.toBeInstanceOf(StreamNotFoundError);
    await store.appendToStream('s2', NO_STREAM, [{ type: 'E', data: 1 }]);
    await store.appendToStream('s2', STREAM_EXISTS, [{ type: 'E', data: 2 }]);
    expect(store.streamVersion('s2')).toBe(1);
  });

  it('enforces exact expected version (optimistic concurrency)', async () => {
    await store.appendToStream('a', NO_STREAM, [
      { type: 'E', data: 1 },
      { type: 'E', data: 2 },
    ]);
    // current version = 1
    await expect(
      store.appendToStream('a', 0, [{ type: 'E', data: 3 }])
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await store.appendToStream('a', 1, [{ type: 'E', data: 3 }]);
    expect(store.streamVersion('a')).toBe(2);
  });

  it('ANY skips the check', async () => {
    await store.appendToStream('a', ANY, [{ type: 'E', data: 1 }]);
    await store.appendToStream('a', ANY, [{ type: 'E', data: 2 }]);
    expect(store.streamVersion('a')).toBe(1);
  });

  it('reads stream slices and backwards', async () => {
    for (let i = 0; i < 5; i++) {
      await store.appendToStream('s', ANY, [{ type: 'E', data: i }]);
    }
    expect(store.readStream('s', { fromVersion: 2 })).toHaveLength(3);
    expect(store.readStream('s', { limit: 2 })).toHaveLength(2);
    const back = store.readStream('s', { backwards: true, limit: 2 });
    expect(back[0].data).toBe(4);
    expect(back[1].data).toBe(3);
  });

  it('readAll returns events in global order with type filter', async () => {
    await store.appendToStream('a', NO_STREAM, [{ type: 'T1', data: 1 }]);
    await store.appendToStream('b', NO_STREAM, [{ type: 'T2', data: 2 }]);
    await store.appendToStream('a', ANY, [{ type: 'T1', data: 3 }]);
    const all = store.readAll();
    expect(all.map((e) => e.streamId)).toEqual(['a', 'b', 'a']);
    const t1 = store.readAll({ typeFilter: (t) => t === 'T1' });
    expect(t1).toHaveLength(2);
  });

  it('stores metadata (correlation/causation)', async () => {
    const [e] = await store.appendToStream('m', NO_STREAM, [
      {
        type: 'E',
        data: {},
        metadata: { correlationId: 'corr-1', causationId: 'cmd-9', actor: 'alice' },
      },
    ]);
    expect(e.metadata.correlationId).toBe('corr-1');
    expect(e.metadata.causationId).toBe('cmd-9');
    expect(e.metadata.actor).toBe('alice');
  });

  // --------------------------------------------------------------- snapshots

  it('saves and loads snapshots; repository loads snapshot + tail', async () => {
    const repo = new AggregateRepository<BankAccount, AccountState>(
      store,
      (id) => new BankAccount(id),
      3 // snapshot every 3 events
    );
    const acc = BankAccount.open('acct-1', 'bob', 100);
    await repo.save(acc); // 1 event, no snapshot yet
    acc.deposit(50);
    acc.deposit(25);
    await repo.save(acc); // version 2 → snapshot written (3 events total)

    const snap = store.loadSnapshot<AccountState>('acct-1');
    expect(snap).not.toBeNull();
    expect(snap!.streamVersion).toBe(2);
    expect(snap!.state.balance).toBe(175);

    acc.withdraw(20);
    await repo.save(acc); // version 3, events: snapshot@2 + tail event

    const loaded = await repo.load('acct-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.balance).toBe(155);
    expect(loaded!.version).toBe(3);
  });

  it('buildSnapshot folds events into state', async () => {
    await store.appendToStream('x', NO_STREAM, [
      { type: 'add', data: { v: 1 } },
      { type: 'add', data: { v: 2 } },
      { type: 'add', data: { v: 3 } },
    ]);
    const snap = store.buildSnapshot('x', 0, (s, e) => s + (e.data as { v: number }).v);
    expect(snap.state).toBe(6);
    expect(snap.streamVersion).toBe(2);
  });

  // --------------------------------------------------------------- upcasting

  it('upcasts old schema versions on read', async () => {
    await store.appendToStream('u', NO_STREAM, [
      { type: 'UserRenamed', schemaVersion: 1, data: { name: 'old' } },
    ]);
    store.registerUpcaster('UserRenamed', 1, (e) => ({
      ...e,
      schemaVersion: 2,
      data: { firstName: (e.data as { name: string }).name, lastName: '' },
    }));
    const [e] = store.readStream('u');
    expect(e.schemaVersion).toBe(2);
    expect((e.data as { firstName: string }).firstName).toBe('old');
  });

  it('chains upcasters v1 -> v2 -> v3', async () => {
    await store.appendToStream('u2', NO_STREAM, [
      { type: 'E', schemaVersion: 1, data: { v: 'a' } },
    ]);
    store.registerUpcaster('E', 1, (e) => ({
      ...e,
      schemaVersion: 2,
      data: { v: `${(e.data as { v: string }).v}b` },
    }));
    store.registerUpcaster('E', 2, (e) => ({
      ...e,
      schemaVersion: 3,
      data: { v: `${(e.data as { v: string }).v}c` },
    }));
    const [e] = store.readStream('u2');
    expect(e.schemaVersion).toBe(3);
    expect((e.data as { v: string }).v).toBe('abc');
  });

  // ------------------------------------------------------- subscriptions

  it('live subscription receives committed events', async () => {
    const seen: StoredEvent[] = [];
    store.subscribe((e) => {
      seen.push(e);
    });
    await store.appendToStream('a', NO_STREAM, [{ type: 'E', data: 1 }]);
    await store.appendToStream('b', NO_STREAM, [{ type: 'E', data: 2 }]);
    expect(seen).toHaveLength(2);
  });

  it('catch-up subscription replays history from a position', async () => {
    await store.appendToStream('a', NO_STREAM, [
      { type: 'E', data: 1 },
      { type: 'E', data: 2 },
    ]);
    const seen: StoredEvent[] = [];
    store.subscribe((e) => seen.push(e), { fromPosition: 1 });
    expect(seen).toHaveLength(1);
    await store.appendToStream('a', ANY, [{ type: 'E', data: 3 }]);
    expect(seen).toHaveLength(2);
  });

  it('subscription type filter is honored', async () => {
    const seen: string[] = [];
    store.subscribe((e) => seen.push(e.type), { typeFilter: (t) => t === 'Wanted' });
    await store.appendToStream('a', NO_STREAM, [
      { type: 'Wanted', data: 1 },
      { type: 'Skipped', data: 2 },
    ]);
    expect(seen).toEqual(['Wanted']);
  });

  // --------------------------------------------------------------- serialize

  it('serializes and restores the log', async () => {
    await store.appendToStream('a', NO_STREAM, [
      { type: 'E', data: { x: 1 }, metadata: { correlationId: 'c' } },
    ]);
    await store.appendToStream('b', NO_STREAM, [{ type: 'F', data: [1, 2] }]);
    const records = store.serializeAll();
    const restored = EventStore.deserialize(records);
    expect(restored.globalPosition).toBe(2);
    expect(restored.streamVersion('a')).toBe(0);
    const [e] = restored.readStream('a');
    expect(e.data).toEqual({ x: 1 });
    expect(e.metadata.correlationId).toBe('c');
  });
});

// ------------------------------------------------------------ projections

describe('Projection engine', () => {
  interface BalanceSheet {
    [accountId: string]: number;
  }

  const balancesProjection: IProjection<BalanceSheet> = {
    name: 'balances',
    eventTypes: ['AccountOpened', 'Deposited', 'Withdrawn'],
    initialState: () => ({}),
    fold(state, e) {
      const d = e.data as { amount?: number; balance?: number };
      const s = { ...state };
      switch (e.type) {
        case 'AccountOpened':
          s[e.streamId] = d.balance ?? 0;
          break;
        case 'Deposited':
          s[e.streamId] = (s[e.streamId] ?? 0) + (d.amount ?? 0);
          break;
        case 'Withdrawn':
          s[e.streamId] = (s[e.streamId] ?? 0) - (d.amount ?? 0);
          break;
      }
      return s;
    },
  };

  it('rebuilds a projection from the log', async () => {
    const store = new EventStore();
    const repo = new AggregateRepository<BankAccount, AccountState>(
      store,
      (id) => new BankAccount(id)
    );
    const a = BankAccount.open('a', 'x', 10);
    a.deposit(5);
    const b = BankAccount.open('b', 'y', 100);
    b.withdraw(30);
    await repo.save(a);
    await repo.save(b);

    const mgr = new ProjectionManager(store);
    const inst = mgr.register(balancesProjection);
    await inst.rebuild();
    expect(inst.state['a']).toBe(15);
    expect(inst.state['b']).toBe(70);
    expect(inst.position).toBe(store.globalPosition - 1);
  });

  it('live projection tracks new commits after start', async () => {
    const store = new EventStore();
    const mgr = new ProjectionManager(store);
    const inst = mgr.register(balancesProjection);
    inst.start();
    const repo = new AggregateRepository<BankAccount, AccountState>(
      store,
      (id) => new BankAccount(id)
    );
    const a = BankAccount.open('live', 'z', 1);
    a.deposit(9);
    await repo.save(a);
    expect(inst.state['live']).toBe(10);
    inst.stop();
    const a2 = BankAccount.open('late', 'z', 1);
    await repo.save(a2);
    expect(inst.state['late']).toBeUndefined();
  });

  it('checkpoints track position for resume', async () => {
    const store = new EventStore();
    const mgr = new ProjectionManager(store);
    const inst = mgr.register(balancesProjection);
    await store.appendToStream('a', NO_STREAM, [
      { type: 'AccountOpened', data: { balance: 5 } },
    ]);
    await inst.rebuild();
    const cp = inst.checkpoint();
    expect(cp.position).toBe(0);
    const cps = mgr.saveCheckpoints();
    expect(cps).toHaveLength(1);
    expect(mgr.checkpointFor('balances')!.position).toBe(0);
  });
});
