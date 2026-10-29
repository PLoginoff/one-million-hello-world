/**
 * ReadModel Engines — projection store, updaters, query engine, consistency.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ProjectionStore,
  VersionConflictError,
} from '../implementations/ProjectionStore';
import {
  ProjectionUpdater,
  type ReadModelEvent,
  type Projection,
} from '../implementations/ProjectionUpdater';
import { ReadQueryEngine, type Predicate } from '../implementations/QueryEngine';
import {
  waitForPosition,
  waitForProjection,
  queryConsistent,
  asOptimistic,
  enforcePolicy,
  StaleReadError,
} from '../implementations/ReadConsistency';

// --------------------------------------------------------------- fixtures

const ev = (
  position: number,
  type: string,
  aggregateId: string,
  data: unknown,
  aggregateVersion = position,
): ReadModelEvent => ({
  eventId: `e-${position}`,
  type,
  aggregateId,
  aggregateVersion,
  position,
  data,
  metadata: {},
  timestamp: Date.now(),
});

interface UserDoc {
  name: string;
  email: string;
  age: number;
  status: string;
  [k: string]: unknown;
}

const userProjection: Projection<UserDoc> = {
  name: 'users',
  collectionName: 'users',
  handlers: {
    'user.created': (e, col) => {
      const d = e.data as { name: string; email: string; age: number };
      col.upsert(e.aggregateId, { ...d, status: 'active' }, { appliedPosition: e.position });
    },
    'user.renamed': (e, col) => {
      col.patch(e.aggregateId, { name: (e.data as { name: string }).name } as Partial<UserDoc>, {
        appliedPosition: e.position,
      });
    },
    'user.deactivated': (e, col) => {
      col.patch(e.aggregateId, { status: 'inactive' } as Partial<UserDoc>, {
        appliedPosition: e.position,
      });
    },
    'user.deleted': (e, col) => {
      col.delete(e.aggregateId);
    },
  },
};

// ------------------------------------------------------------- store basics

describe('ProjectionStore / Collection', () => {
  let store: ProjectionStore;
  beforeEach(() => {
    store = new ProjectionStore();
  });

  it('upserts and retrieves documents', () => {
    const c = store.collection<UserDoc>('users');
    c.upsert('u1', { name: 'a', email: 'a@x', age: 30, status: 'active' });
    const d = c.get('u1');
    expect(d?.data.name).toBe('a');
    expect(d?.version).toBe(1);
    c.upsert('u1', { name: 'a2', email: 'a@x', age: 30, status: 'active' });
    expect(c.get('u1')?.version).toBe(2);
    expect(c.get('u1')?.data.name).toBe('a2');
  });

  it('optimistic upsert throws on version mismatch', () => {
    const c = store.collection<UserDoc>('users');
    c.upsert('u1', { name: 'a', email: 'e', age: 1, status: 'active' });
    expect(() =>
      c.upsert('u1', { name: 'b', email: 'e', age: 1, status: 'active' }, { expectedVersion: 5 }),
    ).toThrow(VersionConflictError);
    expect(() =>
      c.upsert('u1', { name: 'b', email: 'e', age: 1, status: 'active' }, { expectedVersion: 1 }),
    ).not.toThrow();
  });

  it('patch merges fields', () => {
    const c = store.collection<UserDoc>('users');
    c.upsert('u1', { name: 'a', email: 'e', age: 1, status: 'active' });
    c.patch('u1', { name: 'new' });
    const d = c.get('u1');
    expect(d?.data.name).toBe('new');
    expect(d?.data.email).toBe('e');
  });

  it('equality index finds docs by field', () => {
    const c = store.collection<UserDoc>('users');
    c.indexBy('status');
    c.upsert('u1', { name: 'a', email: 'a', age: 1, status: 'active' });
    c.upsert('u2', { name: 'b', email: 'b', age: 2, status: 'inactive' });
    c.upsert('u3', { name: 'c', email: 'c', age: 3, status: 'active' });
    const active = c.findByField('status', 'active');
    expect(active.map((d) => d.id).sort()).toEqual(['u1', 'u3']);
    // index updates on patch
    c.patch('u1', { status: 'inactive' });
    expect(c.findByField('status', 'active').map((d) => d.id)).toEqual(['u3']);
    expect(c.findByField('status', 'inactive').map((d) => d.id).sort()).toEqual(['u1', 'u2']);
  });

  it('sorted index supports range queries', () => {
    const c = store.collection<UserDoc>('users');
    c.sortedIndexBy('age');
    c.upsert('u1', { name: 'a', email: 'a', age: 10, status: 'x' });
    c.upsert('u2', { name: 'b', email: 'b', age: 20, status: 'x' });
    c.upsert('u3', { name: 'c', email: 'c', age: 30, status: 'x' });
    const lt = c.findByRange('age', 'lt', 20);
    expect(lt?.map((d) => d.id)).toEqual(['u1']);
    const gte = c.findByRange('age', 'gte', 20);
    expect(gte?.map((d) => d.id).sort()).toEqual(['u2', 'u3']);
  });

  it('delete removes doc from indexes', () => {
    const c = store.collection<UserDoc>('users');
    c.indexBy('status');
    c.upsert('u1', { name: 'a', email: 'a', age: 1, status: 'active' });
    c.delete('u1');
    expect(c.findByField('status', 'active').length).toBe(0);
    expect(c.get('u1')).toBeUndefined();
  });

  it('tracks global appliedPosition', () => {
    store.recordAppliedPosition(5);
    store.recordAppliedPosition(3); // shouldn't regress
    store.recordAppliedPosition(10);
    expect(store.appliedPosition).toBe(10);
  });
});

// ---------------------------------------------------------------- updater

describe('ProjectionUpdater', () => {
  let store: ProjectionStore;
  let updater: ProjectionUpdater;

  beforeEach(() => {
    store = new ProjectionStore();
    updater = new ProjectionUpdater(store);
    updater.register(userProjection);
  });

  it('apply() projects events into the collection', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a@x', age: 30 }),
      ev(2, 'user.created', 'u2', { name: 'b', email: 'b@x', age: 25 }),
    ]);
    const c = store.collection<UserDoc>('users');
    expect(c.size).toBe(2);
    expect(c.get('u1')?.data.name).toBe('a');
    expect(updater.checkpoint('users')).toBe(2);
  });

  it('apply() skips already-applied events (idempotent)', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a@x', age: 30 }),
      ev(2, 'user.created', 'u1', { name: 'a2', email: 'a@x', age: 31 }),
    ]);
    const outcome = await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'different', email: 'x', age: 0 }),
    ]);
    expect(outcome.eventsSkipped).toBe(1);
    expect(store.collection<UserDoc>('users').get('u1')?.data.name).toBe('a2');
  });

  it('patch + delete events mutate correctly', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a@x', age: 30 }),
      ev(2, 'user.renamed', 'u1', { name: 'alice' }),
      ev(3, 'user.deactivated', 'u1', {}),
    ]);
    const d = store.collection<UserDoc>('users').get('u1');
    expect(d?.data.name).toBe('alice');
    expect(d?.data.status).toBe('inactive');
    await updater.apply('users', [ev(4, 'user.deleted', 'u1', {})]);
    expect(store.collection('users').get('u1')).toBeUndefined();
  });

  it('a failing handler does not advance checkpoint past the failure', async () => {
    const badProjection: Projection = {
      name: 'bad',
      collectionName: 'bad',
      handlers: {
        'e.fail': () => {
          throw new Error('nope');
        },
        'e.ok': (_e, col) => {
          col.upsert('x', { v: 1 });
        },
      },
    };
    updater.register(badProjection);
    const outcome = await updater.apply('bad', [
      ev(1, 'e.ok', 'a', {}),
      ev(2, 'e.fail', 'a', {}),
      ev(3, 'e.ok', 'a', {}),
    ]);
    expect(outcome.errors.length).toBe(1);
    expect(outcome.eventsProcessed).toBe(2);
    expect(updater.checkpoint('bad')).toBe(3);
  });

  it('rebuild clears and replays all events', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
      ev(2, 'user.created', 'u2', { name: 'b', email: 'b', age: 2 }),
    ]);
    // Simulate a stale doc that shouldn't survive rebuild.
    store.collection('users').upsert('stale', { name: 'x', email: 'x', age: 0, status: 'x' });
    const outcome = await updater.rebuild('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
      ev(2, 'user.created', 'u2', { name: 'b', email: 'b', age: 2 }),
    ]);
    expect(outcome.mode).toBe('rebuild');
    expect(store.collection('users').get('stale')).toBeUndefined();
    expect(store.collection('users').size).toBe(2);
  });

  it('replay ignores checkpoint filter and re-applies in range', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
      ev(2, 'user.renamed', 'u1', { name: 'b' }),
    ]);
    // replay event 1 — should re-apply despite position <= checkpoint
    const outcome = await updater.replay('users', [ev(1, 'user.created', 'u1', { name: 'orig', email: 'a', age: 1 })], {
      fromPosition: 1,
      toPosition: 1,
    });
    expect(outcome.eventsProcessed).toBe(1);
    // Note: replay re-applied 'created', overwriting the rename — that's
    // why replay callers typically replay a full range.
    expect(store.collection<UserDoc>('users').get('u1')?.data.name).toBe('orig');
  });

  it('catchUp only processes events past checkpoint', async () => {
    await updater.apply('users', [ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 })]);
    const outcome = await updater.catchUp('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }), // already applied
      ev(2, 'user.created', 'u2', { name: 'b', email: 'b', age: 2 }),
      ev(3, 'user.created', 'u3', { name: 'c', email: 'c', age: 3 }),
    ]);
    expect(outcome.eventsProcessed).toBe(2);
  });
});

// ------------------------------------------------------------- query engine

describe('ReadQueryEngine', () => {
  let store: ProjectionStore;
  let engine: ReadQueryEngine;

  beforeEach(() => {
    store = new ProjectionStore();
    const c = store.collection<UserDoc>('users');
    c.indexBy('status');
    c.sortedIndexBy('age');
    c.upsert('u1', { name: 'alice', email: 'a@x', age: 30, status: 'active' });
    c.upsert('u2', { name: 'bob', email: 'b@x', age: 25, status: 'active' });
    c.upsert('u3', { name: 'carol', email: 'c@x', age: 40, status: 'inactive' });
    c.upsert('u4', { name: 'dave', email: 'd@x', age: 20, status: 'active' });
    engine = new ReadQueryEngine(store);
  });

  it('eq predicate uses index', () => {
    const r = engine.query<UserDoc>({
      collection: 'users',
      where: { op: 'eq', field: 'status', value: 'active' },
    });
    expect(r.totalCount).toBe(3);
    expect(r.usedIndex).toBe(true);
  });

  it('range predicate scans (no index used by planner)', () => {
    const r = engine.query<UserDoc>({
      collection: 'users',
      where: { op: 'gt', field: 'age', value: 25 },
    });
    expect(r.totalCount).toBe(2);
    expect(r.items.map((d) => d.name).sort()).toEqual(['alice', 'carol']);
  });

  it('and/or/not predicates compose', () => {
    const where: Predicate = {
      op: 'and',
      predicates: [
        { op: 'eq', field: 'status', value: 'active' },
        {
          op: 'or',
          predicates: [
            { op: 'lt', field: 'age', value: 26 },
            { op: 'eq', field: 'name', value: 'alice' },
          ],
        },
        { op: 'not', predicate: { op: 'eq', field: 'name', value: 'carol' } },
      ],
    };
    const r = engine.query<UserDoc>({ collection: 'users', where });
    expect(r.items.map((d) => d.name).sort()).toEqual(['alice', 'bob', 'dave']);
  });

  it('in predicate matches multiple values', () => {
    const r = engine.query<UserDoc>({
      collection: 'users',
      where: { op: 'in', field: 'name', values: ['alice', 'carol'] },
    });
    expect(r.totalCount).toBe(2);
  });

  it('contains does substring match', () => {
    const r = engine.query<UserDoc>({
      collection: 'users',
      where: { op: 'contains', field: 'email', value: '@x' },
    });
    expect(r.totalCount).toBe(4);
  });

  it('orderBy sorts ascending and descending', () => {
    const asc = engine.query<UserDoc>({
      collection: 'users',
      orderBy: [{ field: 'age', direction: 'asc' }],
    });
    expect(asc.items.map((d) => d.age)).toEqual([20, 25, 30, 40]);
    const desc = engine.query<UserDoc>({
      collection: 'users',
      orderBy: [{ field: 'age', direction: 'desc' }],
    });
    expect(desc.items.map((d) => d.age)).toEqual([40, 30, 25, 20]);
  });

  it('multi-key sort: primary then secondary', () => {
    const c = store.collection<UserDoc>('users');
    c.upsert('u5', { name: 'zed', email: 'z', age: 30, status: 'active' });
    const r = engine.query<UserDoc>({
      collection: 'users',
      where: { op: 'eq', field: 'status', value: 'active' },
      orderBy: [
        { field: 'age', direction: 'asc' },
        { field: 'name', direction: 'asc' },
      ],
    });
    const names = r.items.map((d) => d.name);
    expect(names).toEqual(['dave', 'bob', 'alice', 'zed']);
  });

  it('pagination slices correctly', () => {
    const r = engine.query<UserDoc>({
      collection: 'users',
      orderBy: [{ field: 'age', direction: 'asc' }],
      offset: 1,
      limit: 2,
    });
    expect(r.items.map((d) => d.age)).toEqual([25, 30]);
    expect(r.totalCount).toBe(4);
    expect(r.hasMore).toBe(true);
  });

  it('select projects only requested fields', () => {
    const r = engine.query<{ name: string }>({
      collection: 'users',
      where: { op: 'eq', field: 'name', value: 'alice' },
      select: ['name'],
    });
    expect(r.items[0]).toEqual({ name: 'alice' });
  });

  it('queryOne returns first match', () => {
    const one = engine.queryOne<UserDoc>({
      collection: 'users',
      where: { op: 'eq', field: 'status', value: 'inactive' },
    });
    expect(one?.name).toBe('carol');
  });

  it('count does not paginate', () => {
    expect(engine.count({ collection: 'users' })).toBe(4);
    expect(
      engine.count({ collection: 'users', where: { op: 'eq', field: 'status', value: 'active' } }),
    ).toBe(3);
  });
});

// --------------------------------------------------------------- consistency

describe('ReadConsistency', () => {
  let store: ProjectionStore;
  let updater: ProjectionUpdater;
  let engine: ReadQueryEngine;

  beforeEach(() => {
    store = new ProjectionStore();
    updater = new ProjectionUpdater(store);
    updater.register(userProjection);
    engine = new ReadQueryEngine(store);
  });

  it('waitForPosition resolves when store catches up', async () => {
    setTimeout(() => store.recordAppliedPosition(10), 20);
    const ok = await waitForPosition(store, 10, { timeoutMs: 500, intervalMs: 5 });
    expect(ok).toBe(true);
  });

  it('waitForPosition times out', async () => {
    store.recordAppliedPosition(3);
    const ok = await waitForPosition(store, 10, { timeoutMs: 50, intervalMs: 5 });
    expect(ok).toBe(false);
  });

  it('waitForProjection polls the updater checkpoint', async () => {
    setTimeout(async () => {
      await updater.apply('users', [
        ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
        ev(5, 'user.created', 'u2', { name: 'b', email: 'b', age: 2 }),
      ]);
    }, 20);
    const ok = await waitForProjection(updater, 'users', 5, { timeoutMs: 500 });
    expect(ok).toBe(true);
  });

  it('queryConsistent annotates staleness', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
    ]);
    const fresh = queryConsistent(engine, store, { collection: 'users' }, 1);
    expect(fresh.potentiallyStale).toBe(false);
    const stale = queryConsistent(engine, store, { collection: 'users' }, 100);
    expect(stale.potentiallyStale).toBe(true);
    expect(stale.appliedPosition).toBe(1);
  });

  it('asOptimistic tags lag', async () => {
    await updater.apply('users', [
      ev(5, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
    ]);
    const d = store.collection('users').get('u1');
    expect(d).toBeDefined();
    const opt = asOptimistic(d!, 10);
    expect(opt.stale).toBe(true);
    expect(opt.lag).toBe(5);
  });

  it('enforcePolicy — strong throws when behind head', async () => {
    await updater.apply('users', [
      ev(1, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
    ]);
    const d = store.collection('users').get('u1')!;
    expect(() => enforcePolicy(d, { kind: 'strong' }, 1)).not.toThrow();
    expect(() => enforcePolicy(d, { kind: 'strong' }, 5)).toThrow(StaleReadError);
  });

  it('enforcePolicy — positioned requires minimum position', async () => {
    await updater.apply('users', [
      ev(3, 'user.created', 'u1', { name: 'a', email: 'a', age: 1 }),
    ]);
    const d = store.collection('users').get('u1')!;
    expect(() => enforcePolicy(d, { kind: 'positioned', requiredPosition: 3 })).not.toThrow();
    expect(() => enforcePolicy(d, { kind: 'positioned', requiredPosition: 4 })).toThrow(
      StaleReadError,
    );
  });

  it('enforcePolicy — bounded rejects old docs', async () => {
    const c = store.collection<UserDoc>('users');
    c.upsert('u1', { name: 'a', email: 'a', age: 1, status: 'active' });
    const d = c.get('u1')!;
    expect(() => enforcePolicy(d, { kind: 'bounded', maxStalenessMs: 10_000 })).not.toThrow();
    // hack: rewrite updatedAt to look stale
    const stale: typeof d = { ...d, updatedAt: Date.now() - 60_000 };
    expect(() => enforcePolicy(stale, { kind: 'bounded', maxStalenessMs: 5_000 })).toThrow(
      StaleReadError,
    );
  });
});
