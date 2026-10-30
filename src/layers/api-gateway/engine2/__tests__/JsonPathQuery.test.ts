/**
 * Tests for the JMESPath-like query engine.
 */

import { describe, it, expect } from 'bun:test';
import { CompiledQuery, queryJson } from '../JsonPathQuery';
import { QueryParseError, JsonObject } from '../types';

const doc: JsonObject = {
  user: {
    name: 'ada',
    age: 36,
    address: { city: 'london', zip: 'E1' },
    roles: ['admin', 'dev'],
  },
  items: [
    { sku: 'a1', price: 10, meta: { color: 'red' } },
    { sku: 'b2', price: 25, meta: { color: 'blue' } },
    { sku: 'c3', price: 5, meta: { color: 'red' } },
  ],
  matrix: [
    [1, 2],
    [3, 4],
  ],
  count: 7,
};

describe('JsonPathQuery — field/index access', () => {
  it('reads nested fields', () => {
    expect(queryJson('user.name', doc)).toBe('ada');
    expect(queryJson('user.address.city', doc)).toBe('london');
  });

  it('returns undefined on missing paths', () => {
    expect(queryJson('user.nope', doc)).toBeUndefined();
    expect(queryJson('a.b.c.d', doc)).toBeUndefined();
  });

  it('indexes arrays, including negative indices', () => {
    expect(queryJson('items[0].sku', doc)).toBe('a1');
    expect(queryJson('items[-1].sku', doc)).toBe('c3');
    expect(queryJson('items[99]', doc)).toBeUndefined();
  });

  it('wildcard over arrays and objects', () => {
    // `[*]` wildcard projects `.price` over each element (JMESPath semantics).
    const prices = queryJson('items[*].price', doc);
    expect(prices).toEqual([10, 25, 5]);
    const all = queryJson('items[*]', doc);
    expect(Array.isArray(all)).toBe(true);
    expect((all as unknown[]).length).toBe(3);
  });

  it('flatten concatenates nested arrays', () => {
    expect(queryJson('matrix[]', doc)).toEqual([1, 2, 3, 4]);
  });
});

describe('JsonPathQuery — filters and pipes', () => {
  it('filters arrays by predicate then projects fields', () => {
    const red = queryJson("items[?meta.color=='red'].sku", doc);
    expect(red).toEqual(['a1', 'c3']);

    const filtered = queryJson("items[?meta.color=='red']", doc) as unknown[];
    expect(filtered.length).toBe(2);
  });

  it('filters with numeric comparisons', () => {
    const cheap = queryJson('items[?price<=10]', doc) as Array<{ sku: string }>;
    expect(cheap.map((i) => i.sku)).toEqual(['a1', 'c3']);
    const expensive = queryJson('items[?price>20]', doc) as Array<{ sku: string }>;
    expect(expensive.length).toBe(1);
  });

  it('pipes feed left result into right', () => {
    expect(queryJson('items[?price>20] | [0] | sku', doc)).toBe('b2');
    expect(queryJson('user.roles | [1]', doc)).toBe('dev');
  });

  it('not-equal excludes matching elements', () => {
    const notA1 = queryJson("items[?sku!='a1']", doc) as unknown[];
    expect(notA1.length).toBe(2);
  });
});

describe('JsonPathQuery — projections', () => {
  it('builds objects from sub-queries', () => {
    const out = queryJson('{who: user.name, count: count}', doc) as JsonObject;
    expect(out).toEqual({ who: 'ada', count: 7 });
  });

  it('omits fields whose query yields undefined', () => {
    const out = queryJson('{who: user.name, missing: nope.deep}', doc) as JsonObject;
    expect(out).toEqual({ who: 'ada' });
  });

  it('supports nested projection sources', () => {
    const out = queryJson('{city: user.address.city, firstSku: items[0].sku}', doc);
    expect(out).toEqual({ city: 'london', firstSku: 'a1' });
  });
});

describe('JsonPathQuery — CompiledQuery reuse', () => {
  it('evaluates multiple docs with one parse', () => {
    const q = new CompiledQuery('user.name');
    expect(q.evaluate(doc)).toBe('ada');
    expect(q.evaluate({ user: { name: 'grace' } })).toBe('grace');
    expect(q.evaluate(null)).toBeUndefined();
  });
});

describe('JsonPathQuery — parse errors', () => {
  it('rejects unterminated strings', () => {
    expect(() => new CompiledQuery("a[?b=='oops")).toThrow(QueryParseError);
  });
  it('rejects dangling dots', () => {
    expect(() => new CompiledQuery('a.')).toThrow(QueryParseError);
  });
  it('rejects unexpected characters', () => {
    expect(() => new CompiledQuery('a & b')).toThrow(QueryParseError);
  });
  it('rejects garbage after expression', () => {
    expect(() => new CompiledQuery('a b c')).toThrow(QueryParseError);
  });
});
