/**
 * Repository Engine tests
 *
 * Covers: spec compile → predicate + parameterized SQL, keyset cursor
 * pagination (forward/backward/stability), optimistic locking, soft-delete
 * global filter, chunked batch ops, secondary index lookup, and percentile
 * metrics.
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import {
  Spec,
  SpecCompiler,
  CursorPaginator,
  QueryMetrics,
  VersionedStore,
  RepositoryEngine,
  OptimisticLockError,
  CursorError,
  SpecError,
} from '../../engine';
import type { StoredEntity } from '../../engine';

interface User extends StoredEntity {
  readonly name: string;
  readonly age: number;
  readonly city: string;
  readonly vip: boolean;
  readonly createdAt: Date;
}

let seq = 0;
function mkUser(
  name: string,
  age: number,
  city = 'NYC',
  vip = false
): Omit<User, 'version' | 'deletedAt'> {
  return { id: `u${++seq}`, name, age, city, vip, createdAt: new Date(2024, 0, seq) };
}

beforeEach(() => {
  seq = 0;
});

// --------------------------------------------------------------------------

describe('Spec builder', () => {
  it('builds comparison nodes fluently', () => {
    const s = Spec.field('age').gte(18);
    expect(s.node.kind).toBe('cmp');
  });

  it('composes and/or/not immutably', () => {
    const a = Spec.field('a').eq(1);
    const b = Spec.field('b').eq(2);
    const combined = a.and(b);
    expect(combined.node.kind).toBe('and');
    expect(a.node.kind).toBe('cmp'); // unchanged
  });

  it('rejects empty IN list', () => {
    expect(() => Spec.in('x', [])).toThrow(SpecError);
  });

  it('rejects empty field names', () => {
    expect(() => Spec.field('  ')).toThrow(SpecError);
  });
});

// --------------------------------------------------------------------------

describe('SpecCompiler — predicates', () => {
  const compiler = new SpecCompiler();
  const rows = [
    { name: 'alice', age: 30, city: 'NYC', vip: true, note: null },
    { name: 'bob', age: 17, city: 'LA', vip: false, note: 'x' },
    { name: 'carol', age: 45, city: 'NYC', vip: false, note: 'y' },
  ];

  it('evaluates all comparison ops', () => {
    const run = (spec: Spec) => rows.filter(compiler.compilePredicate<unknown>(spec));
    expect(run(Spec.field('age').gt(18)).map((r) => r.name)).toEqual(['alice', 'carol']);
    expect(run(Spec.field('age').lte(30)).map((r) => r.name)).toEqual(['alice', 'bob']);
    expect(run(Spec.field('name').startsWith('a')).length).toBe(1);
    expect(run(Spec.field('name').contains('o')).map((r) => r.name)).toEqual(['bob', 'carol']);
    expect(run(Spec.field('city').eq('NYC')).length).toBe(2);
    expect(run(Spec.field('vip').ne(true)).length).toBe(2);
  });

  it('evaluates in/between/null ops', () => {
    const run = (spec: Spec) => rows.filter(compiler.compilePredicate<unknown>(spec));
    expect(run(Spec.in('city', ['LA'])).length).toBe(1);
    expect(run(Spec.between('age', 18, 40)).map((r) => r.name)).toEqual(['alice']);
    expect(run(Spec.between('age', 17, 45, false)).map((r) => r.name)).toEqual(['alice']);
    expect(run(Spec.isNull('note')).map((r) => r.name)).toEqual(['alice']);
    expect(run(Spec.notNull('note')).length).toBe(2);
  });

  it('evaluates nested boolean trees', () => {
    const spec = Spec.field('city')
      .eq('NYC')
      .and(Spec.field('vip').eq(true).or(Spec.field('age').gt(40)));
    const out = rows.filter(compiler.compilePredicate<unknown>(spec));
    expect(out.map((r) => r.name)).toEqual(['alice', 'carol']);
  });

  it('resolves nested dot paths', () => {
    const spec = Spec.field('address.zip').eq('10001');
    const row = { address: { zip: '10001' } };
    expect(compiler.compilePredicate<unknown>(spec)(row)).toBe(true);
    expect(compiler.compilePredicate<unknown>(spec)({ address: { zip: '9' } })).toBe(false);
  });
});

describe('SpecCompiler — SQL output', () => {
  const compiler = new SpecCompiler();

  it('emits parameterized WHERE with $n placeholders', () => {
    const c = compiler.compile(Spec.field('age').gte(18).and(Spec.field('vip').eq(true)));
    expect(c.sql).toBe('("age" >= $1 AND "vip" = $2)');
    expect(c.params).toEqual([18, true]);
  });

  it('expands IN lists to placeholder groups', () => {
    const c = compiler.compile(Spec.in('city', ['NYC', 'LA']));
    expect(c.sql).toBe('"city" IN ($1, $2)');
    expect(c.params).toEqual(['NYC', 'LA']);
  });

  it('never interpolates values (injection-safe)', () => {
    const evil = `'; DROP TABLE users; --`;
    const c = compiler.compile(Spec.field('name').eq(evil));
    expect(c.sql).not.toContain('DROP');
    expect(c.params).toEqual([evil]);
  });

  it('emits BETWEEN and NULL checks', () => {
    expect(compiler.compile(Spec.between('age', 1, 5)).sql).toBe('"age" BETWEEN $1 AND $2');
    expect(compiler.compile(Spec.isNull('x')).sql).toBe('"x" IS NULL');
    expect(compiler.compile(Spec.all()).sql).toBe('1=1');
    expect(compiler.compile(Spec.not(Spec.field('a').eq(1))).sql).toBe('NOT ("a" = $1)');
  });

  it('collects referenced fields', () => {
    const c = compiler.compile(Spec.field('a').eq(1).and(Spec.field('b').gt(2)));
    expect(c.fields).toEqual(['a', 'b']);
  });
});

// --------------------------------------------------------------------------

describe('CursorPaginator', () => {
  const paginator = new CursorPaginator();
  const sort = [
    { field: 'age', dir: 'asc' as const },
    { field: 'id', dir: 'asc' as const },
  ];
  const mk = (id: string, age: number) => ({ id, age });
  const rows = [mk('a', 1), mk('b', 1), mk('c', 2), mk('d', 3), mk('e', 5), mk('f', 8)];

  it('pages forward with stable ordering on ties', () => {
    const p1 = paginator.paginate(rows, () => true, sort, { first: 2 });
    expect(p1.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(p1.pageInfo.hasNextPage).toBe(true);
    expect(p1.pageInfo.hasPreviousPage).toBe(false);

    const p2 = paginator.paginate(rows, () => true, sort, {
      first: 2,
      after: p1.pageInfo.endCursor as string,
    });
    expect(p2.rows.map((r) => r.id)).toEqual(['c', 'd']);
    expect(p2.pageInfo.hasPreviousPage).toBe(true);

    const p3 = paginator.paginate(rows, () => true, sort, {
      first: 2,
      after: p2.pageInfo.endCursor as string,
    });
    expect(p3.rows.map((r) => r.id)).toEqual(['e', 'f']);
    expect(p3.pageInfo.hasNextPage).toBe(false);
  });

  it('pages backward with last+before', () => {
    const full = paginator.paginate(rows, () => true, sort, {});
    const endCursor = full.pageInfo.endCursor as string;
    const p = paginator.paginate(rows, () => true, sort, { last: 2, before: endCursor });
    expect(p.rows.map((r) => r.id)).toEqual(['d', 'e']);
    expect(p.pageInfo.hasPreviousPage).toBe(true);
  });

  it('handles descending sort', () => {
    const descSort = [
      { field: 'age', dir: 'desc' as const },
      { field: 'id', dir: 'asc' as const },
    ];
    const p1 = paginator.paginate(rows, () => true, descSort, { first: 2 });
    expect(p1.rows.map((r) => r.age)).toEqual([8, 5]);
    const p2 = paginator.paginate(rows, () => true, descSort, {
      first: 2,
      after: p1.pageInfo.endCursor as string,
    });
    expect(p2.rows.map((r) => r.age)).toEqual([3, 2]);
  });

  it('rejects cursors minted under a different sort', () => {
    const cursor = paginator.encode(rows[0], sort);
    expect(() =>
      paginator.paginate(rows, () => true, [{ field: 'name', dir: 'asc' }], { after: cursor })
    ).toThrow(CursorError);
  });

  it('rejects malformed cursors', () => {
    expect(() => paginator.paginate(rows, () => true, sort, { after: '!!!' })).toThrow(
      CursorError
    );
  });

  it('is stable under mutation (insert before cursor)', () => {
    const p1 = paginator.paginate(rows, () => true, sort, { first: 2 });
    const cursor = p1.pageInfo.endCursor as string;
    // A new row that would land on page 1 under offset pagination.
    const rows2 = [...rows, mk('z', 0)];
    const p2 = paginator.paginate(rows2, () => true, sort, { first: 4, after: cursor });
    // Keyset continues exactly where the cursor pointed — 'z' does not
    // shift the window.
    expect(p2.rows.map((r) => r.id)).toEqual(['c', 'd', 'e', 'f']);
  });
});

// --------------------------------------------------------------------------

describe('VersionedStore', () => {
  it('starts versions at 1 and bumps on update', () => {
    const store = new VersionedStore<User>();
    const u = store.insert(mkUser('a', 1));
    expect(u.version).toBe(1);
    const u2 = store.update(u.id, { age: 2 }, 1);
    expect(u2.version).toBe(2);
    expect(u2.age).toBe(2);
  });

  it('rejects stale-version updates (optimistic lock)', () => {
    const store = new VersionedStore<User>();
    const u = store.insert(mkUser('a', 1));
    store.update(u.id, { age: 2 }, 1);
    try {
      store.update(u.id, { age: 3 }, 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OptimisticLockError);
      const err = e as OptimisticLockError;
      expect(err.expectedVersion).toBe(1);
      expect(err.actualVersion).toBe(2);
    }
  });

  it('soft-deletes hide rows from scan/get but tombstones remain', () => {
    const store = new VersionedStore<User>();
    const u = store.insert(mkUser('a', 1));
    store.delete(u.id);
    expect(store.get(u.id)).toBeNull();
    expect(store.get(u.id, true)?.deletedAt).not.toBeNull();
    expect(store.scan(() => true).length).toBe(0);
    expect(store.scan(() => true, true).length).toBe(1);
  });

  it('restores soft-deleted rows', () => {
    const store = new VersionedStore<User>();
    const u = store.insert(mkUser('a', 1));
    store.delete(u.id);
    store.restore(u.id);
    expect(store.get(u.id)?.deletedAt).toBeNull();
  });

  it('chunks insertAll and reports progress', () => {
    const store = new VersionedStore<User>();
    const many = Array.from({ length: 25 }, (_, i) => mkUser(`n${i}`, i));
    const progress: number[] = [];
    store.insertAll(many, 10, (p) => progress.push(p.processed));
    expect(progress).toEqual([10, 20, 25]);
    expect(store.size()).toBe(25);
  });

  it('updateAll mutates matching rows with version bumps', () => {
    const store = new VersionedStore<User>();
    store.insertAll([mkUser('a', 1), mkUser('b', 2), mkUser('c', 3)], 2);
    const updated = store.updateAll(
      (r) => r.age >= 2,
      (r) => ({ age: r.age * 10 })
    );
    expect(updated.map((r) => r.age)).toEqual([20, 30]);
    expect(updated.every((r) => r.version === 2)).toBe(true);
  });

  it('maintains secondary indexes on writes', () => {
    const store = new VersionedStore<User>({ indexedFields: ['city'] });
    store.insert(mkUser('a', 1, 'NYC'));
    store.insert(mkUser('b', 2, 'LA'));
    const hits = store.indexLookup({ kind: 'cmp', op: 'eq', field: 'city', value: 'LA' });
    expect(hits?.size).toBe(1);
  });
});

// --------------------------------------------------------------------------

describe('RepositoryEngine', () => {
  it('queries spec → page end to end', () => {
    const engine = new RepositoryEngine<User>();
    engine.store.insertAll([mkUser('a', 10), mkUser('b', 20, 'LA'), mkUser('c', 30)]);
    const page = engine.query({
      spec: Spec.field('age').gte(15),
      sort: [{ field: 'age', dir: 'desc' }],
      page: { first: 1 },
    });
    expect(page.rows[0].name).toBe('c');
    expect(page.totalMatching).toBe(2);
  });

  it('uses the secondary index for point lookups', () => {
    const engine = new RepositoryEngine<User>({ indexedFields: ['id'] });
    engine.store.insertAll([mkUser('a', 1), mkUser('b', 2)]);
    const page = engine.query({ spec: Spec.field('id').eq('u2') });
    expect(page.rows.length).toBe(1);
    expect(page.rows[0].name).toBe('b');
  });

  it('explain() returns the SQL projection', () => {
    const engine = new RepositoryEngine<User>();
    const { sql, params } = engine.explain(Spec.field('age').gt(5));
    expect(sql).toBe('"age" > $1');
    expect(params).toEqual([5]);
  });

  it('records metrics per label', () => {
    let t = 0;
    const engine = new RepositoryEngine<User>({ clock: () => (t += 5) });
    engine.store.insert(mkUser('a', 1));
    engine.query({ label: 'findAdults' });
    const snap = engine.metrics.snapshot('findAdults');
    expect(snap).not.toBeNull();
    expect(snap?.count).toBe(1);
    expect(snap?.max).toBeGreaterThanOrEqual(0);
  });
});

// --------------------------------------------------------------------------

describe('QueryMetrics', () => {
  it('computes percentiles over exact samples', () => {
    const m = new QueryMetrics({ unbounded: true });
    for (let i = 1; i <= 100; i++) m.record('q', i);
    const s = m.snapshot('q');
    expect(s?.p50).toBe(50);
    expect(s?.p99).toBe(99);
    expect(s?.mean).toBe(50.5);
    expect(s?.min).toBe(1);
    expect(s?.max).toBe(100);
  });

  it('reservoir bounds memory under many samples', () => {
    const m = new QueryMetrics({ reservoirSize: 16 });
    for (let i = 0; i < 10000; i++) m.record('q', i);
    const s = m.snapshot('q');
    expect(s?.count).toBe(10000);
  });

  it('counts errors separately', () => {
    const m = new QueryMetrics();
    m.record('q', 1);
    m.recordError('q');
    m.recordError('q');
    expect(m.errorsFor('q')).toBe(2);
  });

  it('renders prometheus exposition', () => {
    const m = new QueryMetrics({ unbounded: true });
    m.record('search', 10);
    const text = m.renderPrometheus('search');
    expect(text).toContain('repository_query_duration_ms');
    expect(text).toContain('quantile="0.99"');
  });
});
