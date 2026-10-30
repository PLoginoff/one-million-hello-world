/**
 * ContractMatchers engine tests.
 */

import { describe, it, expect } from 'bun:test';
import {
  MatcherSet,
  matchValue,
  evaluateMatcher,
  structuralDiff,
  formatDiff,
  parsePath,
  renderPath,
  deepEqual,
  isJson,
  jsonTypeOf,
} from '../engine/ContractMatchers';
import type { MatchingRule } from '../engine/ContractMatchers';

describe('path parsing', () => {
  it('parses dotted paths', () => {
    expect(parsePath('$.body.items[*].id')).toEqual([
      { kind: 'key', key: 'body' },
      { kind: 'key', key: 'items' },
      { kind: 'wildcard' },
      { kind: 'key', key: 'id' },
    ]);
  });

  it('parses numeric indexes and quoted keys', () => {
    expect(parsePath("$.a[2].b['weird.key']")).toEqual([
      { kind: 'key', key: 'a' },
      { kind: 'index', index: 2 },
      { kind: 'key', key: 'b' },
      { kind: 'key', key: 'weird.key' },
    ]);
  });

  it('renders runtime paths back to strings', () => {
    expect(renderPath(['body', 'items', 3, 'id'])).toBe('$.body.items[3].id');
    expect(renderPath(['a b'])).toBe("$['a b']");
  });
});

describe('json helpers', () => {
  it('isJson narrows the union', () => {
    expect(isJson({ a: [1, 'x', null] })).toBe(true);
    expect(isJson(() => 1)).toBe(false);
    expect(isJson(undefined)).toBe(false);
  });

  it('jsonTypeOf reports array separately', () => {
    expect(jsonTypeOf([])).toBe('array');
    expect(jsonTypeOf(null)).toBe('null');
    expect(jsonTypeOf({})).toBe('object');
  });

  it('deepEqual compares nested structures', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: '1' })).toBe(false);
  });
});

describe('evaluateMatcher primitives', () => {
  const at = ['body', 'x'];

  it('regex', () => {
    const rule: MatchingRule = { path: '$.body.x', matcher: 'regex', pattern: '^\\d{4}$' };
    expect(evaluateMatcher(rule, '1234', at)).toBeNull();
    expect(evaluateMatcher(rule, '12ab', at)?.reason).toContain('regex');
    expect(evaluateMatcher(rule, 1234, at)?.reason).toContain('not a string');
  });

  it('integer / number / boolean / nullValue', () => {
    expect(evaluateMatcher({ path: '$', matcher: 'integer' }, 5, at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'integer' }, 5.5, at)).not.toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'number' }, 5.5, at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'boolean' }, true, at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'nullValue' }, null, at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'nullValue' }, 0, at)).not.toBeNull();
  });

  it('format matchers', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(evaluateMatcher({ path: '$', matcher: 'uuid' }, uuid, at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'uuid' }, 'nope', at)).not.toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'ipv4' }, '192.168.0.1', at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'ipv4' }, '999.1.1.1', at)).not.toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'email' }, 'a@b.co', at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'datetime' }, '2024-01-02T03:04:05Z', at)).toBeNull();
    expect(evaluateMatcher({ path: '$', matcher: 'date' }, '2024-01-02', at)).toBeNull();
  });

  it('arrayLength constraints', () => {
    const rule: MatchingRule = { path: '$', matcher: 'arrayLength', min: 2, max: 4 };
    expect(evaluateMatcher(rule, [1, 2, 3], at)).toBeNull();
    expect(evaluateMatcher(rule, [1], at)?.expected).toContain('>= 2');
    expect(evaluateMatcher(rule, [1, 2, 3, 4, 5], at)?.expected).toContain('<= 4');
    expect(
      evaluateMatcher({ path: '$', matcher: 'arrayLength', exact: 2 }, [1, 2], at)
    ).toBeNull();
    expect(
      evaluateMatcher({ path: '$', matcher: 'arrayLength', exact: 2 }, [1], at)
    ).not.toBeNull();
    expect(evaluateMatcher(rule, 'notarray', at)).not.toBeNull();
  });

  it('like matches shape not values', () => {
    const template = { id: 1, name: 'x', tags: ['a'] };
    expect(
      evaluateMatcher({ path: '$', matcher: 'like', template }, { id: 99, name: 'y', tags: ['z', 'w'] }, [])
    ).toBeNull();
    const typeMismatch = evaluateMatcher(
      { path: '$', matcher: 'like', template },
      { id: 's', name: 'y', tags: [] },
      []
    );
    expect(typeMismatch?.reason).toContain('type mismatch');
    const missing = evaluateMatcher(
      { path: '$', matcher: 'like', template },
      { id: 1, name: 'y' },
      []
    );
    expect(missing?.reason).toContain('key missing');
  });

  it('eachLike validates every element plus min', () => {
    const rule: MatchingRule = {
      path: '$',
      matcher: 'eachLike',
      template: { id: 0 },
      min: 1,
    };
    expect(evaluateMatcher(rule, [{ id: 1 }, { id: 2 }], [])).toBeNull();
    expect(evaluateMatcher(rule, [], [])).not.toBeNull();
    expect(evaluateMatcher(rule, [{ id: 's' }], [])?.reason).toContain('type mismatch');
  });
});

describe('MatcherSet rule indexing', () => {
  it('indexes rules by path and resolves wildcard segments', () => {
    const set = new MatcherSet([
      { path: '$.body.items[*].id', matcher: 'integer' },
      { path: '$.body.status', matcher: 'regex', pattern: '^(ok|fail)$' },
    ]);
    const rules1 = set.rulesFor(['body', 'items', 0, 'id']);
    expect(rules1).toHaveLength(1);
    const rules2 = set.rulesFor(['body', 'status']);
    expect(rules2).toHaveLength(1);
    expect(set.rulesFor(['body', 'other'])).toHaveLength(0);
  });
});

describe('matchValue end-to-end', () => {
  it('strict equality without rules', () => {
    const r = matchValue({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }, new MatcherSet([]));
    expect(r.matched).toBe(true);
  });

  it('reports field-level mismatches', () => {
    const r = matchValue({ a: 1, b: 'x' }, { a: 1, b: 'y', c: 9 }, new MatcherSet([]));
    expect(r.matched).toBe(false);
    expect(r.mismatches.map((m) => m.path).sort()).toEqual(['$.b', '$.c']);
  });

  it('rules replace equality at their subtree', () => {
    const rules = new MatcherSet([
      { path: '$.id', matcher: 'integer' },
      { path: '$.created', matcher: 'datetime' },
    ]);
    const r = matchValue(
      { id: 1, created: '2024-01-01T00:00:00Z', name: 'x' },
      { id: 777, created: '2031-12-31T23:59:59Z', name: 'x' },
      rules
    );
    expect(r.matched).toBe(true);
  });

  it('nested array wildcard rules apply to every index', () => {
    const rules = new MatcherSet([{ path: '$.items[*].sku', matcher: 'regex', pattern: '^SKU-' }]);
    // Wildcard rule covers the leaf but array length is still strict —
    // use eachLike for variable-length collections.
    const sameLen = matchValue(
      { items: [{ sku: 'SKU-1' }, { sku: 'SKU-2' }] },
      { items: [{ sku: 'SKU-9' }, { sku: 'SKU-7' }] },
      rules
    );
    expect(sameLen.matched).toBe(true);
    const bad = matchValue({ items: [{ sku: 'SKU-1' }] }, { items: [{ sku: 'X-1' }] }, rules);
    expect(bad.matched).toBe(false);
    expect(bad.mismatches[0]?.path).toBe('$.items[0].sku');
  });

  it('eachLike covers variable-length arrays', () => {
    const rules = new MatcherSet([
      { path: '$.items', matcher: 'eachLike', template: { sku: 'SKU-x' }, min: 1 },
    ]);
    const r = matchValue(
      { items: [{ sku: 'SKU-1' }] },
      { items: [{ sku: 'SKU-9' }, { sku: 'SKU-2' }, { sku: 'SKU-3' }] },
      rules
    );
    expect(r.matched).toBe(true);
  });

  it('missing and unexpected values', () => {
    const r = matchValue({ a: 1 }, {}, new MatcherSet([]));
    expect(r.mismatches[0]?.reason).toContain('missing');
    const r2 = matchValue({}, { a: 1 }, new MatcherSet([]));
    expect(r2.mismatches[0]?.reason).toContain('unexpected');
  });
});

describe('structuralDiff', () => {
  it('classifies added/removed/changed/typeChanged', () => {
    const diff = structuralDiff(
      { keep: 1, gone: 'x', ch: 2, tc: 's' },
      { keep: 1, ch: 3, tc: [1], added: true }
    );
    const byPath = new Map(diff.map((d) => [d.path, d.kind]));
    expect(byPath.get('$.gone')).toBe('removed');
    expect(byPath.get('$.added')).toBe('added');
    expect(byPath.get('$.ch')).toBe('changed');
    expect(byPath.get('$.tc')).toBe('typeChanged');
    expect(byPath.has('$.keep')).toBe(false);
  });

  it('diffs nested arrays', () => {
    const diff = structuralDiff({ a: [1, 2, 3] }, { a: [1, 9] });
    const kinds = diff.map((d) => `${d.path}:${d.kind}`);
    expect(kinds).toContain('$.a[1]:changed');
    expect(kinds).toContain('$.a[2]:removed');
  });

  it('formatDiff renders +/- lines', () => {
    const s = formatDiff(structuralDiff({ a: 1 }, { a: 2, b: 1 }));
    expect(s).toContain('- $.a = 1');
    expect(s).toContain('+ $.a = 2');
    expect(s).toContain('+ $.b = 1');
  });
});
