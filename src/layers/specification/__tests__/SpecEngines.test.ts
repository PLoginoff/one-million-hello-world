/**
 * Specification engines — combinators, leaf library, SQL/description
 * rendering, candidate scoring, parameterized specs, serialization.
 */

import { describe, it, expect } from 'bun:test';
import {
  AndSpec,
  Between,
  CandidateSelector,
  Contains,
  Equal,
  FalseSpec,
  GreaterThan,
  GreaterThanOrEqual,
  In,
  IsNotNull,
  IsNull,
  LessThan,
  Matches,
  NotEqual,
  NotSpec,
  OrSpec,
  ParameterizedSpec,
  PredicateSpec,
  SpecOp,
  SpecRegistry,
  StartsWith,
  TrueSpec,
  paramNames,
  remapPlaceholders,
  specFromJson,
  specToJson,
} from '../engines';
import type { SpecNode } from '../engines';

type User = { name: string; age: number; status: string; email: string; tags: string[] };

const adult = new GreaterThanOrEqual<User>('age', 18);
const active = new Equal<User>('status', 'active');

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

describe('Specification combinators', () => {
  it('and requires both', () => {
    const spec = adult.and(active);
    expect(spec.isSatisfiedBy({ name: 'a', age: 20, status: 'active', email: '', tags: [] })).toBe(true);
    expect(spec.isSatisfiedBy({ name: 'b', age: 20, status: 'banned', email: '', tags: [] })).toBe(false);
    expect(spec.isSatisfiedBy({ name: 'c', age: 10, status: 'active', email: '', tags: [] })).toBe(false);
  });

  it('or accepts either', () => {
    const spec = new LessThan<User>('age', 13).or(new Equal<User>('status', 'vip'));
    expect(spec.isSatisfiedBy({ name: 'k', age: 10, status: 'free', email: '', tags: [] })).toBe(true);
    expect(spec.isSatisfiedBy({ name: 'v', age: 50, status: 'vip', email: '', tags: [] })).toBe(true);
    expect(spec.isSatisfiedBy({ name: 'n', age: 30, status: 'free', email: '', tags: [] })).toBe(false);
  });

  it('not inverts', () => {
    expect(active.not().isSatisfiedBy({ name: '', age: 0, status: 'banned', email: '', tags: [] })).toBe(true);
  });

  it('nested composition composes correctly', () => {
    const spec = adult.and(active.or(new Equal<User>('status', 'vip'))).not();
    const u = { name: '', age: 30, status: 'active', email: '', tags: [] };
    expect(spec.isSatisfiedBy(u)).toBe(false); // inner was true → not → false
    const u2 = { name: '', age: 30, status: 'banned', email: '', tags: [] };
    expect(spec.isSatisfiedBy(u2)).toBe(true); // inner false → not → true
  });
});

// ---------------------------------------------------------------------------
// Leaf library
// ---------------------------------------------------------------------------

describe('CommonSpecs leaf library', () => {
  const u: User = { name: 'alice', age: 30, status: 'active', email: 'a@corp.com', tags: ['x', 'y'] };

  it('GreaterThan / LessThan / Between', () => {
    expect(new GreaterThan<User>('age', 29).isSatisfiedBy(u)).toBe(true);
    expect(new LessThan<User>('age', 30).isSatisfiedBy(u)).toBe(false);
    expect(new Between<User>('age', 18, 65).isSatisfiedBy(u)).toBe(true);
    expect(new Between<User>('age', 31, 65).isSatisfiedBy(u)).toBe(false);
  });

  it('In / NotIn', () => {
    expect(new In<User>('status', ['active', 'vip']).isSatisfiedBy(u)).toBe(true);
    expect(new In<User>('status', ['vip']).isSatisfiedBy(u)).toBe(false);
  });

  it('Contains (string + array), StartsWith, Matches', () => {
    expect(new Contains<User>('email', '@corp').isSatisfiedBy(u)).toBe(true);
    expect(new Contains<User>('tags', 'x').isSatisfiedBy(u)).toBe(true);
    expect(new StartsWith<User>('name', 'ali').isSatisfiedBy(u)).toBe(true);
    expect(new Matches<User>('name', /^a.e$/).isSatisfiedBy(u)).toBe(false);
    expect(new Matches<User>('name', '^ali').isSatisfiedBy(u)).toBe(true);
  });

  it('IsNull / IsNotNull', () => {
    expect(new IsNull<User>('missing' as keyof User & string).isSatisfiedBy(u)).toBe(true);
    expect(new IsNotNull<User>('age').isSatisfiedBy(u)).toBe(true);
  });

  it('True/False identities', () => {
    expect(new TrueSpec<User>().isSatisfiedBy(u)).toBe(true);
    expect(new FalseSpec<User>().isSatisfiedBy(u)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SQL translation
// ---------------------------------------------------------------------------

describe('Specification → SQL', () => {
  it('leaf renders parameterized fragment', () => {
    const { sql, params } = new GreaterThanOrEqual('age', 18).toSql();
    expect(sql).toBe('"age" >= ?');
    expect(params).toEqual([18]);
  });

  it('composite wraps children in parens', () => {
    const spec = new GreaterThanOrEqual('age', 18).and(new Equal('status', 'active'));
    const { sql, params } = spec.toSql();
    expect(sql).toBe('("age" >= ?) AND ("status" = ?)');
    expect(params).toEqual([18, 'active']);
  });

  it('not renders NOT wrapper', () => {
    const { sql } = new Equal('x', 1).not().toSql();
    expect(sql).toBe('NOT ("x" = ?)');
  });

  it('escapes LIKE wildcards and nulls translate to IS NULL', () => {
    const { sql, params } = new Contains('n', 'a%b').toSql();
    expect(sql).toContain('LIKE ?');
    expect(params[0]).toBe('%a\\%b%');
    const { sql: n } = new Equal('d', null).toSql();
    expect(n).toBe('"d" IS NULL');
  });

  it('In binds each element; empty In is always-false', () => {
    const { sql, params } = new In('s', ['a', 'b']).toSql();
    expect(sql).toBe('"s" IN (?, ?)');
    expect(params).toEqual(['a', 'b']);
    expect(new In('s', []).toSql().sql).toBe('1 = 0');
  });

  it('remapPlaceholders → postgres $n, skips quoted text', () => {
    const spec = new Equal('a', 'x?y').and(new Equal('b', 2));
    const { sql } = spec.toSql();
    const pg = remapPlaceholders(sql, 'postgres');
    expect(pg).toContain('$1');
    expect(pg).toContain('$2');
  });
});

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

describe('Specification → description', () => {
  it('renders readable leaf text', () => {
    expect(new GreaterThanOrEqual('age', 18).describe()).toBe('age ≥ 18');
    expect(new Between('price', 1, 9).describe()).toBe('price between 1 and 9');
    expect(new In('s', ['a']).describe()).toBe("s in ('a')");
  });

  it('renders composite text', () => {
    const spec = new GreaterThanOrEqual('age', 18).and(new Equal('status', 'active'));
    expect(spec.describe()).toBe("(age ≥ 18) and (status = 'active')");
    expect(spec.not().describe()).toContain('not (');
  });
});

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

describe('CandidateSelector', () => {
  const spec = new GreaterThanOrEqual<User>('age', 18).and(new Equal<User>('status', 'active'));
  const candidates: User[] = [
    { name: 'kid', age: 10, status: 'banned', email: '', tags: [] },      // 0/2
    { name: 'junior', age: 10, status: 'active', email: '', tags: [] },   // 1/2
    { name: 'senior', age: 30, status: 'active', email: '', tags: [] },   // 2/2
  ];

  it('selectAll keeps only fully-satisfying', () => {
    const sel = new CandidateSelector(spec);
    expect(sel.selectAll(candidates).map((u) => u.name)).toEqual(['senior']);
  });

  it('bestMatch returns closest even when not fully satisfied', () => {
    const sel = new CandidateSelector(new GreaterThanOrEqual<User>('age', 18).and(new Equal<User>('status', 'vip')));
    const best = sel.bestMatch(candidates);
    expect(best).not.toBeNull();
    expect(best?.candidate.name).toBe('senior');
    expect(best?.score).toBe(0.5);
    expect(best?.detail).toHaveLength(2);
  });

  it('scoreAll orders by score desc', () => {
    const sel = new CandidateSelector(spec);
    const scores = sel.scoreAll(candidates);
    expect(scores.map((s) => s.candidate.name)).toEqual(['senior', 'junior', 'kid']);
    expect(scores[0]?.score).toBe(1);
    expect(scores[2]?.score).toBe(0);
  });

  it('minScore rejects weak matches', () => {
    const sel = new CandidateSelector(spec);
    expect(sel.bestMatch(candidates, 0.9)?.candidate.name).toBe('senior');
    expect(sel.bestMatch([], 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('Specification serialization', () => {
  it('round-trips composite spec through JSON', () => {
    const spec = new GreaterThanOrEqual<User>('age', 18)
      .and(new Contains<User>('email', '@corp'))
      .or(new Equal<User>('status', 'vip'));
    const json = specToJson(spec);
    const back = specFromJson<User>(json);
    const u: User = { name: '', age: 25, status: 'x', email: 'me@corp.io', tags: [] };
    expect(back.isSatisfiedBy(u)).toBe(spec.isSatisfiedBy(u));
    expect(back.describe()).toBe(spec.describe());
  });

  it('round-trips Date and RegExp operands', () => {
    const spec = new GreaterThan<User>('age', new Date('2000-01-01'));
    const back = specFromJson<User>(specToJson(spec));
    const cand = { name: '', age: 0, status: '', email: '', tags: [] } as unknown as User;
    void cand;
    const row = { age: new Date('2001-01-01') } as unknown as User;
    expect(back.isSatisfiedBy(row)).toBe(true);
  });

  it('custom specs rehydrate via registry', () => {
    const reg = new SpecRegistry<User>().register('HasTag', (p) =>
      new PredicateSpec<User>('HasTag', (u) => u.tags.includes(String(p.tag)), 'has tag', p)
    );
    const spec = new PredicateSpec<User>('HasTag', (u) => u.tags.includes('x'), 'has tag', { tag: 'x' });
    const back = specFromJson<User>(specToJson(spec), reg);
    expect(back.isSatisfiedBy({ name: '', age: 0, status: '', email: '', tags: ['x'] })).toBe(true);
  });

  it('unregistered custom spec throws', () => {
    const spec = new PredicateSpec<User>('Mystery', () => true);
    expect(() => specFromJson<User>(specToJson(spec))).toThrow(/no factory registered/);
  });
});

// ---------------------------------------------------------------------------
// Parameterized specs
// ---------------------------------------------------------------------------

describe('ParameterizedSpec', () => {
  const template = new ParameterizedSpec<User>('Eligible', {
    kind: 'logic',
    op: 'and',
    children: [
      { kind: 'leaf', field: 'age', op: SpecOp.Gte, value: { $param: 'minAge' } },
      { kind: 'leaf', field: 'status', op: SpecOp.Eq, value: { $param: 'status' } },
    ],
  });

  it('lists unbound parameters', () => {
    expect(paramNames(template.template()).sort()).toEqual(['minAge', 'status']);
    expect(template.unbound).toHaveLength(2);
  });

  it('bind produces a working spec', () => {
    const spec = template.bind({ minAge: 21, status: 'active' });
    expect(spec.isSatisfiedBy({ name: '', age: 25, status: 'active', email: '', tags: [] })).toBe(true);
    expect(spec.isSatisfiedBy({ name: '', age: 18, status: 'active', email: '', tags: [] })).toBe(false);
  });

  it('missing params throw with names', () => {
    expect(() => template.bind({ minAge: 21 })).toThrow(/unbound parameter\(s\): status/);
  });

  it('bindPartial leaves remaining markers', () => {
    const half = template.bindPartial({ minAge: 21 });
    expect(half.unbound).toEqual(['status']);
    const spec = half.bind({ status: 'active' });
    expect(spec.isSatisfiedBy({ name: '', age: 21, status: 'active', email: '', tags: [] })).toBe(true);
  });

  it('describe renders markers', () => {
    expect(template.describe()).toContain('<minAge>');
  });
});
