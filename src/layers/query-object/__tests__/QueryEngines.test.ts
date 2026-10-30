/**
 * Query-object engines — criteria trees, fluent Query, predicate
 * compiler, SQL generator, optimizer, in-memory store, serialization.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { and, or, not, field, exists, notExists, leafCount } from '../engines/Criteria';
import { CompareOp } from '../engines/types';
import { PredicateCompiler, getField } from '../engines/PredicateCompiler';
import { SqlGenerator } from '../engines/SqlGenerator';
import { QueryOptimizer } from '../engines/QueryOptimizer';
import { Query } from '../engines/Query';
import { InMemoryQueryStore } from '../engines/InMemoryQueryStore';
import { astToJson, astFromJson } from '../engines/serialization';

// ---------------------------------------------------------------------------
// Criteria builders
// ---------------------------------------------------------------------------

describe('Criteria builders', () => {
  it('flattens nested AND/OR of the same kind', () => {
    const a = field('a').eq(1);
    const b = field('b').eq(2);
    const c = field('c').eq(3);
    const node = and(a, and(b, c));
    expect(node.kind).toBe('logic');
    if (node.kind === 'logic') expect(node.children).toHaveLength(3);
  });

  it('collapses double negation', () => {
    const a = field('a').eq(1);
    expect(not(not(a))).toBe(a);
  });

  it('flips negated flag on inSubquery instead of wrapping', () => {
    const sub: Parameters<typeof field>[0] extends never ? never : ReturnType<Query['toAst']> =
      Query.from('t').select('id').toAst();
    const n = field('x').inSubquery(sub);
    const neg = not(n);
    expect(neg.kind).toBe('inSubquery');
    if (neg.kind === 'inSubquery') expect(neg.negated).toBe(true);
  });

  it('counts leaves', () => {
    const c = and(field('a').eq(1), or(field('b').eq(2), field('c').eq(3)));
    expect(leafCount(c)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Predicate compiler
// ---------------------------------------------------------------------------

describe('PredicateCompiler', () => {
  const compiler = new PredicateCompiler();

  it('evaluates comparison operators', () => {
    const rows = [{ age: 20 }, { age: 30 }, { age: 40 }];
    const p = compiler.compile(field('age').between(25, 35));
    expect(rows.filter(p)).toEqual([{ age: 30 }]);
  });

  it('implements AND/OR/NOT composition', () => {
    const row = { a: 1, b: 2 };
    expect(compiler.compile(and(field('a').eq(1), field('b').eq(2)))(row)).toBe(true);
    expect(compiler.compile(or(field('a').eq(9), field('b').eq(2)))(row)).toBe(true);
    expect(compiler.compile(not(field('a').eq(1)))(row)).toBe(false);
  });

  it('follows SQL NULL semantics for comparisons', () => {
    const row = { v: null };
    expect(compiler.compile(field('v').gt(1))(row)).toBe(false);
    expect(compiler.compile(field('v').isNull())(row)).toBe(true);
    expect(compiler.compile(field('v').isNotNull())(row)).toBe(false);
    expect(compiler.compile(field('missing').isNull())(row)).toBe(true);
  });

  it('resolves dotted paths into nested objects', () => {
    const row = { address: { city: 'Berlin' } };
    expect(compiler.compile(field('address.city').eq('Berlin'))(row)).toBe(true);
    expect(getField(row, 'address.city')).toBe('Berlin');
  });

  it('supports In / NotIn with Set membership', () => {
    const p = compiler.compile(field('id').in([1, 2, 3]));
    expect(p({ id: 2 })).toBe(true);
    expect(p({ id: 5 })).toBe(false);
    expect(compiler.compile(field('id').notIn([1]))({ id: 9 })).toBe(true);
  });

  it('string ops: contains, startsWith, endsWith, matches', () => {
    const row = { name: 'alice@example.com' };
    expect(compiler.compile(field('name').contains('example'))(row)).toBe(true);
    expect(compiler.compile(field('name').startsWith('alice'))(row)).toBe(true);
    expect(compiler.compile(field('name').endsWith('.com'))(row)).toBe(true);
    expect(compiler.compile(field('name').matches(/@example\./))(row)).toBe(true);
    expect(compiler.compile(field('name').matches('^bob'))(row)).toBe(false);
  });

  it('array containment via Contains', () => {
    const row = { tags: ['a', 'b', 'c'] };
    expect(compiler.compile(field('tags').contains('b'))(row)).toBe(true);
    expect(compiler.compile(field('tags').contains('z'))(row)).toBe(false);
  });

  it('case-insensitive mode', () => {
    const ci = new PredicateCompiler({ caseInsensitive: true });
    expect(ci.compile(field('n').eq('ALICE'))({ n: 'alice' })).toBe(true);
    expect(ci.compile(field('n').contains('EXAM'))({ n: 'example' })).toBe(true);
  });

  it('Date comparisons by timestamp', () => {
    const d = new Date('2024-01-01');
    expect(compiler.compile(field('at').eq(new Date('2024-01-01')))({ at: d })).toBe(true);
    expect(compiler.compile(field('at').gt(new Date('2023-01-01')))({ at: d })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SqlGenerator
// ---------------------------------------------------------------------------

describe('SqlGenerator', () => {
  it('renders parameterized SELECT with binds in order', () => {
    const gen = new SqlGenerator({ dialect: 'postgres' });
    const q = Query.from('users')
      .select('id', 'name')
      .where(and(field('age').gte(18), field('name').startsWith('al')))
      .toAst();
    const { sql, params } = gen.toSql(q);
    expect(sql).toBe(
      `SELECT "id", "name" FROM "users" WHERE ("age" >= $1) AND ("name" LIKE $2 ESCAPE '\\\\')`
    );
    expect(params).toEqual([18, 'al%']);
  });

  it('escapes LIKE wildcards in operand text', () => {
    const gen = new SqlGenerator({ dialect: 'ansi' });
    const q = Query.from('t').where(field('v').contains('50%_off')).toAst();
    const { params } = gen.toSql(q);
    expect(params[0]).toBe('%50\\%\\_off%');
  });

  it('empty IN renders always-false; NOT IN always-true', () => {
    const gen = new SqlGenerator({ dialect: 'ansi' });
    const { sql: a } = gen.toSql(Query.from('t').where(field('x').in([])).toAst());
    const { sql: b } = gen.toSql(Query.from('t').where(field('x').notIn([])).toAst());
    expect(a).toContain('1 = 0');
    expect(b).toContain('1 = 1');
  });

  it('Eq null becomes IS NULL, Ne null becomes IS NOT NULL', () => {
    const gen = new SqlGenerator({ dialect: 'ansi' });
    const { sql: a, params: pa } = gen.toSql(Query.from('t').where(field('x').eq(null)).toAst());
    const { sql: b } = gen.toSql(Query.from('t').where(field('x').ne(null)).toAst());
    expect(a).toContain('"x" IS NULL');
    expect(pa).toHaveLength(0);
    expect(b).toContain('"x" IS NOT NULL');
  });

  it('renders subquery IN with inner select', () => {
    const gen = new SqlGenerator({ dialect: 'postgres' });
    const sub = Query.from('orders').select('userId').where(field('total').gt(100)).toAst();
    const q = Query.from('users').where(field('id').inSubquery(sub)).toAst();
    const { sql, params } = gen.toSql(q);
    expect(sql).toContain('"id" IN (SELECT "userId" FROM "orders" WHERE "total" > $1)');
    expect(params).toEqual([100]);
  });

  it('renders EXISTS with correlation', () => {
    const gen = new SqlGenerator({ dialect: 'ansi' });
    const sub = Query.from('posts').where(field('draft').eq(false)).toAst();
    const q = Query.from('users').where(exists(sub, { userId: 'id' })).toAst();
    const { sql } = gen.toSql(q);
    expect(sql).toContain('EXISTS (SELECT 1 FROM "posts" WHERE');
    expect(sql).toContain('"userId" = "id"');
  });

  it('derives COUNT(*) preserving WHERE but dropping order/page', () => {
    const gen = new SqlGenerator({ dialect: 'mysql' });
    const q = Query.from('u').where(field('a').eq(1)).orderBy('a').limit(5).toAst();
    const { sql, params } = gen.toCountSql(q);
    expect(sql).toBe('SELECT COUNT(*) AS `count` FROM `u` WHERE `a` = ?');
    expect(params).toEqual([1]);
  });

  it('mssql renders OFFSET/FETCH pagination', () => {
    const gen = new SqlGenerator({ dialect: 'mssql' });
    const q = Query.from('t').orderBy('id').limit(10).offset(20).toAst();
    const { sql } = gen.toSql(q);
    expect(sql).toContain('OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY');
  });

  it('throws for Matches on dialects without a regex op', () => {
    const gen = new SqlGenerator({ dialect: 'sqlite' });
    const q = Query.from('t').where(field('v').matches('x.*')).toAst();
    expect(() => gen.toSql(q)).toThrow(/no regex operator/);
  });

  it('inline renderer escapes string literals', () => {
    const gen = new SqlGenerator({ dialect: 'ansi' });
    const q = Query.from('t').where(field('n').eq("o'hara")).toAst();
    expect(gen.toInlineSql(q)).toContain("'o''hara'");
  });
});

// ---------------------------------------------------------------------------
// QueryOptimizer
// ---------------------------------------------------------------------------

describe('QueryOptimizer', () => {
  it('picks the index covering the most selective conjunct', () => {
    const opt = new QueryOptimizer([
      { name: 'ix_users_id', table: 'users', columns: ['id'], unique: true },
      { name: 'ix_users_age', table: 'users', columns: ['age'] },
    ]);
    const ast = Query.from('users')
      .where(and(field('id').eq(7), field('age').gt(20)))
      .toAst();
    const plan = opt.plan(ast);
    expect(plan.accessPath).toBe('index');
    expect(plan.index?.name).toBe('ix_users_id');
  });

  it('merges same-field range into BETWEEN', () => {
    const opt = new QueryOptimizer();
    const ast = Query.from('t')
      .where(and(field('x').gte(5), field('x').lt(10)))
      .toAst();
    const plan = opt.plan(ast);
    // lt is exclusive so it won't merge — use lte
    expect(plan.optimized).not.toBeNull();
    const ast2 = Query.from('t')
      .where(and(field('x').gte(5), field('x').lte(10)))
      .toAst();
    const plan2 = opt.plan(ast2);
    expect(plan2.optimized?.kind).toBe('compare');
    if (plan2.optimized?.kind === 'compare') {
      expect(plan2.optimized.op).toBe(CompareOp.Between);
    }
  });

  it('honors forceIndex and noIndex hints', () => {
    const opt = new QueryOptimizer([
      { name: 'ix_a', table: 't', columns: ['a'] },
      { name: 'ix_b', table: 't', columns: ['b'], unique: true },
    ]);
    const q1 = Query.from('t').where(field('b').eq(1)).hint({ forceIndex: 'ix_a' }).toAst();
    const p1 = opt.plan(q1);
    expect(p1.index?.name).toBe('ix_a');
    const q2 = Query.from('t').where(field('b').eq(1)).hint({ noIndex: true }).toAst();
    expect(opt.plan(q2).accessPath).toBe('full_scan');
  });

  it('explain produces readable narration', () => {
    const opt = new QueryOptimizer([{ name: 'ix', table: 't', columns: ['a'], unique: true }]);
    const text = opt.explain(Query.from('t').where(field('a').eq(1)).toAst());
    expect(text).toContain('index ix');
  });
});

// ---------------------------------------------------------------------------
// InMemoryQueryStore
// ---------------------------------------------------------------------------

describe('InMemoryQueryStore', () => {
  let store: InMemoryQueryStore;

  const users = [
    { id: 1, name: 'alice', age: 30, role: 'admin' },
    { id: 2, name: 'bob', age: 25, role: 'user' },
    { id: 3, name: 'carol', age: 35, role: 'user' },
    { id: 4, name: 'dave', age: 40, role: 'user' },
  ];
  const posts = [
    { id: 10, userId: 1, title: 'hello', published: true },
    { id: 11, userId: 1, title: 'world', published: false },
    { id: 12, userId: 3, title: 'carol post', published: true },
  ];

  beforeEach(() => {
    store = new InMemoryQueryStore();
    store.load('users', users);
    store.load('posts', posts);
  });

  it('filters + orders + paginates', () => {
    const q = Query.from('users')
      .where(field('role').eq('user'))
      .orderBy('age', 'desc')
      .limit(2)
      .toAst();
    const r = store.execute(q);
    expect(r.rows.map((u) => u.name)).toEqual(['dave', 'carol']);
    expect(r.totalMatched).toBe(3);
  });

  it('projects select columns', () => {
    const q = Query.from('users').select('name').where(field('id').eq(1)).toAst();
    expect(store.execute(q).rows[0]).toEqual({ name: 'alice' });
  });

  it('count query shares the same filter', () => {
    const q = Query.from('users').where(field('age').gte(30));
    const rows = store.execute(q.toAst());
    const cnt = store.execute(q.toCount().toAst());
    expect(cnt.count).toBe(3);
    expect(cnt.count).toBe(rows.totalMatched);
  });

  it('IN subquery against another table', () => {
    const sub = Query.from('posts').select('userId').where(field('published').eq(true)).toAst();
    const q = Query.from('users').where(field('id').inSubquery(sub)).toAst();
    expect(store.execute(q).rows.map((u) => u.id)).toEqual([1, 3]);
  });

  it('correlated EXISTS', () => {
    const sub = Query.from('posts').where(field('published').eq(false)).toAst();
    const q = Query.from('users').where(exists(sub, { userId: 'id' })).toAst();
    expect(store.execute(q).rows.map((u) => u.name)).toEqual(['alice']);
    const q2 = Query.from('users').where(notExists(sub, { userId: 'id' })).toAst();
    expect(store.execute(q2).rows.map((u) => u.name)).toEqual(['bob', 'carol', 'dave']);
  });

  it('include attaches related rows', () => {
    const q = Query.from('users')
      .where(field('id').eq(1))
      .include('posts', 'userId')
      .toAst();
    const r = store.execute(q);
    const row = r.rows[0] as Record<string, unknown>;
    expect((row.posts as unknown[]).length).toBe(2);
  });

  it('whereField sugar attaches criteria', () => {
    const q = Query.from('users');
    q.whereField('age').gt(30);
    expect(store.execute(q.toAst()).rows.map((u) => u.name)).toEqual(['carol', 'dave']);
  });

  it('distinct dedupes projected rows', () => {
    const q = Query.from('users').select('role').distinct().orderBy('role').toAst();
    expect(store.execute(q).rows).toEqual([{ role: 'admin' }, { role: 'user' }]);
  });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('QueryAst serialization', () => {
  it('round-trips Dates and RegExps losslessly', () => {
    const q = Query.from('t')
      .where(
        and(
          field('at').gt(new Date('2024-06-01T00:00:00Z')),
          field('name').matches(/^a.*z$/)
        )
      )
      .toAst();
    const json = astToJson(q);
    const back = astFromJson(json);
    const pred = new PredicateCompiler().compile(back.where);
    expect(pred({ at: new Date('2024-07-01'), name: 'abz' })).toBe(true);
    expect(pred({ at: new Date('2024-01-01'), name: 'abz' })).toBe(false);
  });

  it('rejects malformed payloads', () => {
    expect(() => astFromJson('"nope"')).toThrow(TypeError);
    expect(() => astFromJson('{"x":1}')).toThrow(TypeError);
  });
});
