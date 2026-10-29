/**
 * WriteModel Engines — aggregate root, event storage, repository, router.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AggregateRoot, type DomainEvent } from '../implementations/AggregateRoot';
import {
  EventStorage,
  ConcurrencyError,
  NO_STREAM,
  ANY_VERSION,
} from '../implementations/EventStorage';
import {
  AggregateRepository,
  InvariantViolationError,
} from '../implementations/AggregateRepository';
import { CommandRouter } from '../implementations/CommandRouter';
import {
  InvariantRegistry,
  InvariantViolationException,
} from '../implementations/InvariantRegistry';

// ------------------------------------------------------------ test aggregate

interface AccountState {
  owner: string;
  balance: number;
  open: boolean;
}

class BankAccount extends AggregateRoot<AccountState> {
  readonly aggregateType = 'account';
  private _owner = '';
  private _balance = 0;
  private _open = false;

  get balance(): number {
    return this._balance;
  }
  get owner(): string {
    return this._owner;
  }
  get isOpen(): boolean {
    return this._open;
  }

  open(owner: string, initial: number): void {
    if (this._open) this.violate('account already open');
    if (initial < 0) this.violate('initial deposit must be >= 0');
    this.raise('account.opened', { owner, balance: initial });
  }

  deposit(amount: number): void {
    if (!this._open) this.violate('account not open');
    if (amount <= 0) this.violate('deposit must be positive');
    this.raise('account.deposited', { amount });
  }

  withdraw(amount: number): void {
    if (!this._open) this.violate('account not open');
    if (amount <= 0) this.violate('withdrawal must be positive');
    if (amount > this._balance) this.violate('insufficient funds');
    this.raise('account.withdrawn', { amount });
  }

  close(): void {
    if (this._balance > 0) this.violate('cannot close with balance');
    this.raise('account.closed', {});
  }

  protected applyEvent(event: DomainEvent): void {
    const d = event.data as { owner?: string; balance?: number; amount?: number };
    switch (event.type) {
      case 'account.opened':
        this._owner = d.owner ?? '';
        this._balance = d.balance ?? 0;
        this._open = true;
        break;
      case 'account.deposited':
        this._balance += d.amount ?? 0;
        break;
      case 'account.withdrawn':
        this._balance -= d.amount ?? 0;
        break;
      case 'account.closed':
        this._open = false;
        break;
    }
  }

  override snapshotState(): AccountState {
    return { owner: this._owner, balance: this._balance, open: this._open };
  }

  protected override restoreSnapshot(state: AccountState): void {
    this._owner = state.owner;
    this._balance = state.balance;
    this._open = state.open;
  }
}

// ---------------------------------------------------------------- storage

describe('EventStorage', () => {
  let store: EventStorage;
  beforeEach(() => {
    store = new EventStorage();
  });

  it('appends events and assigns versions', () => {
    const e = store.append('account', 'a1', NO_STREAM, [
      { type: 'opened', data: { owner: 'x' } },
      { type: 'deposited', data: { amount: 5 } },
    ]);
    expect(e.length).toBe(2);
    expect(e[0]?.aggregateVersion).toBe(1);
    expect(e[1]?.aggregateVersion).toBe(2);
    expect(store.streamVersion('account', 'a1')).toBe(2);
  });

  it('rejects append with wrong expected version', () => {
    store.append('account', 'a1', NO_STREAM, [{ type: 'opened', data: {} }]);
    expect(() =>
      store.append('account', 'a1', NO_STREAM, [{ type: 'x', data: {} }]),
    ).toThrow(ConcurrencyError);
    expect(() =>
      store.append('account', 'a1', 5, [{ type: 'x', data: {} }]),
    ).toThrow(ConcurrencyError);
  });

  it('ANY_VERSION skips concurrency check', () => {
    store.append('account', 'a1', NO_STREAM, [{ type: 'a', data: {} }]);
    const appended = store.append('account', 'a1', ANY_VERSION, [{ type: 'b', data: {} }]);
    expect(appended[0]?.aggregateVersion).toBe(2);
  });

  it('readStream honours fromVersion and maxCount', () => {
    store.append('a', 'x', NO_STREAM, [
      { type: 'e1', data: {} },
      { type: 'e2', data: {} },
      { type: 'e3', data: {} },
    ]);
    const tail = store.readStream('a', 'x', { fromVersion: 2 });
    expect(tail.length).toBe(2);
    expect(tail[0]?.type).toBe('e2');
    const limited = store.readStream('a', 'x', { maxCount: 1 });
    expect(limited.length).toBe(1);
  });

  it('readAll returns global order', () => {
    store.append('a', 'x', NO_STREAM, [{ type: 'e1', data: {} }]);
    store.append('b', 'y', NO_STREAM, [{ type: 'e2', data: {} }]);
    store.append('a', 'x', 1, [{ type: 'e3', data: {} }]);
    const all = store.readAll();
    expect(all.map((e) => e.type)).toEqual(['e1', 'e2', 'e3']);
    const tail = store.readAll({ fromPosition: 2 });
    expect(tail.map((e) => e.type)).toEqual(['e2', 'e3']);
  });

  it('envelope carries correlation + causation metadata', () => {
    const [e] = store.append('a', 'x', NO_STREAM, [
      { type: 't', data: {}, correlationId: 'corr-1', causationId: 'cause-1' },
    ]);
    expect(e?.correlationId).toBe('corr-1');
    expect(e?.causationId).toBe('cause-1');
    expect(e?.aggregateId).toBe('x');
    expect(e?.aggregateType).toBe('a');
  });

  it('deleteStream removes stream but keeps global history', () => {
    store.append('a', 'x', NO_STREAM, [{ type: 'e', data: {} }]);
    store.deleteStream('a', 'x');
    expect(store.streamVersion('a', 'x')).toBe(0);
    expect(store.readAll().length).toBe(1);
  });

  it('save/load snapshot', () => {
    store.saveSnapshot({
      aggregateId: 'x',
      aggregateType: 'a',
      version: 3,
      state: { n: 42 },
      takenAt: Date.now(),
    });
    const s = store.loadSnapshot<{ n: number }>('a', 'x');
    expect(s?.state.n).toBe(42);
    expect(s?.version).toBe(3);
  });
});

// -------------------------------------------------------------- aggregate

describe('AggregateRoot', () => {
  it('raise() records pending events and applies state', () => {
    const a = new BankAccount('a1');
    a.open('alice', 100);
    expect(a.balance).toBe(100);
    expect(a.pendingEvents.length).toBe(1);
    expect(a.isDirty).toBe(true);
    a.deposit(50);
    expect(a.balance).toBe(150);
    expect(a.pendingEvents.length).toBe(2);
  });

  it('version stays at committed until markCommitted', () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    expect(a.version).toBe(0);
    expect(a.expectedVersion).toBe(1);
  });

  it('loadFromHistory rebuilds state from envelopes', () => {
    const store = new EventStorage();
    store.append('account', 'a1', NO_STREAM, [
      { type: 'account.opened', data: { owner: 'alice', balance: 10 } },
      { type: 'account.deposited', data: { amount: 5 } },
      { type: 'account.withdrawn', data: { amount: 3 } },
    ]);
    const a = new BankAccount('a1');
    a.loadFromHistory(store.readStream('account', 'a1'));
    expect(a.balance).toBe(12);
    expect(a.owner).toBe('alice');
    expect(a.version).toBe(3);
    expect(a.pendingEvents.length).toBe(0);
  });

  it('violations are recorded by command methods', () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    a.withdraw(1000); // violates insufficient funds
    expect(a.violations.length).toBeGreaterThan(0);
  });

  it('snapshotState/restoreSnapshot round-trips', () => {
    const a = new BankAccount('a1');
    a.open('alice', 42);
    const state = a.snapshotState();
    expect(state?.balance).toBe(42);
    const b = new BankAccount('a1');
    b.loadFromSnapshot(
      { aggregateId: 'a1', aggregateType: 'account', version: 1, state: state!, takenAt: 0 },
      [],
    );
    expect(b.balance).toBe(42);
    expect(b.version).toBe(1);
  });
});

// -------------------------------------------------------------- repository

describe('AggregateRepository', () => {
  let store: EventStorage;
  let repo: AggregateRepository<BankAccount>;

  beforeEach(() => {
    store = new EventStorage();
    repo = new AggregateRepository(store, 'account', (id) => new BankAccount(id), {
      snapshotFrequency: 3,
    });
  });

  it('saves and reloads an aggregate', async () => {
    const a = new BankAccount('a1');
    a.open('alice', 100);
    a.deposit(50);
    await repo.save(a);
    expect(a.version).toBe(2);
    expect(a.isDirty).toBe(false);

    const loaded = await repo.load('a1');
    expect(loaded?.balance).toBe(150);
    expect(loaded?.version).toBe(2);
  });

  it('enforces optimistic concurrency', async () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    await repo.save(a);

    // Simulate two concurrent loads.
    const a1 = (await repo.load('a1'))!;
    const a2 = (await repo.load('a1'))!;
    a1.deposit(10);
    a2.deposit(20);
    await repo.save(a1);
    await expect(repo.save(a2)).rejects.toThrow(ConcurrencyError);
  });

  it('rejects save when invariants are violated', async () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    await repo.save(a);
    a.withdraw(100);
    await expect(repo.save(a)).rejects.toThrow(InvariantViolationError);
  });

  it('save with no pending events is a no-op', async () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    await repo.save(a);
    const v = await repo.save(a);
    expect(v).toBe(1);
  });

  it('snapshots every N events', async () => {
    const a = new BankAccount('a1');
    a.open('alice', 0);
    await repo.save(a);
    for (let i = 0; i < 3; i++) {
      const agg = (await repo.load('a1'))!;
      agg.deposit(1);
      await repo.save(agg);
    }
    const snap = store.loadSnapshot<AccountState>('account', 'a1');
    expect(snap).toBeDefined();
    expect(snap!.version >= 3).toBe(true);
  });

  it('loadOrCreate returns fresh aggregate when missing', async () => {
    const a = await repo.loadOrCreate('new-id');
    expect(a.version).toBe(0);
    expect(a.id).toBe('new-id');
  });
});

// ------------------------------------------------------------------ router

describe('CommandRouter', () => {
  let store: EventStorage;
  let repo: AggregateRepository<BankAccount>;
  let router: CommandRouter<BankAccount>;

  beforeEach(() => {
    store = new EventStorage();
    repo = new AggregateRepository(store, 'account', (id) => new BankAccount(id));
    router = new CommandRouter(repo);
    router
      .add({
        commandType: 'account.open',
        mode: 'create',
        aggregateIdOf: (c) => (c.payload as { id: string }).id,
        invoke: (agg, c) =>
          agg.open(
            (c.payload as { owner: string }).owner,
            (c.payload as { initial: number }).initial,
          ),
      })
      .add({
        commandType: 'account.deposit',
        mode: 'existing',
        aggregateIdOf: (c) => (c.payload as { id: string }).id,
        invoke: (agg, c) => agg.deposit((c.payload as { amount: number }).amount),
      })
      .add({
        commandType: 'account.maybeDeposit',
        mode: 'upsert',
        aggregateIdOf: (c) => (c.payload as { id: string }).id,
        invoke: (agg, c) => {
          if ((c.payload as { amount: number }).amount > 0) {
            agg.open('auto', 0);
            agg.deposit((c.payload as { amount: number }).amount);
          }
        },
      });
  });

  it('create-mode creates an aggregate', async () => {
    const r = await router.route({
      type: 'account.open',
      payload: { id: 'a1', owner: 'alice', initial: 10 },
    });
    expect(r.newVersion).toBe(1);
    expect(r.emittedEvents.length).toBe(1);
    expect(r.noOp).toBe(false);
  });

  it('existing-mode fails when aggregate missing', async () => {
    await expect(
      router.route({ type: 'account.deposit', payload: { id: 'nope', amount: 1 } }),
    ).rejects.toThrow('missing aggregate');
  });

  it('create-mode fails when aggregate exists', async () => {
    await router.route({ type: 'account.open', payload: { id: 'a1', owner: 'x', initial: 0 } });
    await expect(
      router.route({ type: 'account.open', payload: { id: 'a1', owner: 'y', initial: 0 } }),
    ).rejects.toThrow('existing aggregate');
  });

  it('upsert-mode creates when missing', async () => {
    const r = await router.route({
      type: 'account.maybeDeposit',
      payload: { id: 'a9', amount: 5 },
    });
    expect(r.newVersion).toBe(2);
  });

  it('noOp outcome when command emits nothing', async () => {
    await router.route({ type: 'account.open', payload: { id: 'a1', owner: 'x', initial: 0 } });
    const r = await router.route({
      type: 'account.maybeDeposit',
      payload: { id: 'a1', amount: 0 },
    });
    expect(r.noOp).toBe(true);
  });

  it('propagates correlationId into envelopes', async () => {
    await router.route({
      type: 'account.open',
      payload: { id: 'a1', owner: 'x', initial: 0 },
      correlationId: 'corr-99',
    });
    const events = store.readStream('account', 'a1');
    expect(events[0]?.metadata['correlationId']).toBe('corr-99');
  });
});

// --------------------------------------------------------- invariant registry

describe('InvariantRegistry', () => {
  it('registers and evaluates global invariants', () => {
    const reg = new InvariantRegistry();
    reg.register<AccountState>('account', (b) =>
      b.check('balance-nonneg', (s) => s.balance >= 0, 'balance negative'),
    );
    const ok = reg.checkAll('account', { owner: 'x', balance: 5, open: true }, 'post');
    expect(ok.length).toBe(0);
    const bad = reg.checkAll('account', { owner: 'x', balance: -1, open: true }, 'post');
    expect(bad.length).toBe(1);
    expect(bad[0]?.invariantName).toBe('balance-nonneg');
  });

  it('scopes invariants to event types', () => {
    const reg = new InvariantRegistry();
    reg.register<AccountState>('account', (b) =>
      b
        .on('account.withdrawn')
        .check('max-withdraw', (s, e) => ((e?.data as { amount: number }).amount ?? 0) <= 100, 'too big')
        .globally()
        .check('always', () => true, 'never'),
    );
    const v = reg.checkAll(
      'account',
      { owner: 'x', balance: 0, open: true },
      'post',
      { type: 'account.withdrawn', data: { amount: 500 } },
    );
    expect(v.length).toBe(1);
    expect(v[0]?.invariantName).toBe('max-withdraw');
    // different event type — no violation
    const v2 = reg.checkAll(
      'account',
      { owner: 'x', balance: 0, open: true },
      'post',
      { type: 'account.deposited', data: { amount: 500 } },
    );
    expect(v2.length).toBe(0);
  });

  it('phase filter separates pre and post checks', () => {
    const reg = new InvariantRegistry();
    reg.register<AccountState>('account', (b) =>
      b
        .preEmit()
        .check('pre-check', (s) => s.open, 'not open (pre)')
        .postEmit()
        .check('post-check', (s) => s.balance >= 0, 'negative (post)'),
    );
    const pre = reg.checkAll('account', { owner: 'x', balance: 0, open: false }, 'pre');
    expect(pre.length).toBe(1);
    expect(pre[0]?.invariantName).toBe('pre-check');
    const post = reg.checkAll('account', { owner: 'x', balance: -1, open: false }, 'post');
    expect(post.length).toBe(1);
    expect(post[0]?.invariantName).toBe('post-check');
  });

  it('enforce throws on errors, returns warnings', () => {
    const reg = new InvariantRegistry();
    reg.register<AccountState>('account', (b) =>
      b
        .check('err', () => false, 'error inv')
        .asWarning()
        .check('warn', () => false, 'warn inv'),
    );
    expect(() =>
      reg.enforce('account', { owner: 'x', balance: 0, open: true }, 'post'),
    ).toThrow(InvariantViolationException);
  });

  it('treats throwing predicates as violations', () => {
    const reg = new InvariantRegistry();
    reg.register<AccountState>('account', (b) =>
      b.check('boom', () => {
        throw new Error('kaboom');
      }, 'threw'),
    );
    const v = reg.checkAll('account', { owner: 'x', balance: 0, open: true }, 'post');
    expect(v.length).toBe(1);
  });
});
