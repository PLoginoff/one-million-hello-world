/**
 * Tests for the real rules-engine machinery: condition DSL, working memory
 * with truth maintenance, priority evaluation, and forward chaining.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { cond, evaluateCondition, resolvePath, deepEqual, parseRegex } from '../domain/dsl';
import { WorkingMemory } from '../domain/WorkingMemory';
import { ProductionRuleEngine, Rule } from '../implementations/ProductionRuleEngine';
import { PriorityEvaluationStrategy } from '../strategies/PriorityEvaluationStrategy';
import { ForwardChainingStrategy } from '../strategies/ForwardChainingStrategy';

describe('Condition DSL', () => {
  const facts = {
    user: { age: 34, email: 'ada@acme.com', roles: ['admin', 'editor'], address: { city: 'Paris' } },
    order: { total: 250.5, items: [{ sku: 'A' }, { sku: 'B' }] },
    flags: { beta: true },
    empty: null,
  };

  it('resolves nested field paths', () => {
    expect(resolvePath(facts, 'user.address.city')).toEqual({ found: true, value: 'Paris' });
    expect(resolvePath(facts, 'user.order.items.0.sku').found).toBe(false);
    expect(resolvePath(facts, 'order.items.1.sku')).toEqual({ found: true, value: 'B' });
    expect(resolvePath(facts, 'user.missing.deep').found).toBe(false);
    expect(resolvePath(facts, 'empty.something').found).toBe(false);
  });

  it('evaluates comparison operators', () => {
    expect(evaluateCondition(cond.gte('user.age', 18), facts)).toBe(true);
    expect(evaluateCondition(cond.lt('user.age', 18), facts)).toBe(false);
    expect(evaluateCondition(cond.eq('user.address.city', 'Paris'), facts)).toBe(true);
    expect(evaluateCondition(cond.neq('user.address.city', 'London'), facts)).toBe(true);
  });

  it('evaluates membership and string operators', () => {
    expect(evaluateCondition(cond.isIn('user.address.city', ['Paris', 'Lyon']), facts)).toBe(true);
    expect(evaluateCondition(cond.notIn('user.address.city', ['London']), facts)).toBe(true);
    expect(evaluateCondition(cond.contains('user.roles', 'admin'), facts)).toBe(true);
    expect(evaluateCondition(cond.contains('user.email', 'acme'), facts)).toBe(true);
    expect(evaluateCondition(cond.startsWith('user.email', 'ada'), facts)).toBe(true);
    expect(evaluateCondition(cond.endsWith('user.email', '.com'), facts)).toBe(true);
  });

  it('evaluates regex matches with literal and bare source', () => {
    expect(evaluateCondition(cond.matches('user.email', '/@acme\\.com$/i'), facts)).toBe(true);
    expect(evaluateCondition(cond.matches('user.email', '@acme\\.com$'), facts)).toBe(true);
    expect(evaluateCondition(cond.matches('user.email', /^ada/), facts)).toBe(true);
    expect(evaluateCondition(cond.matches('user.email', 'gmail'), facts)).toBe(false);
    expect(() => parseRegex('/x/y')).not.toThrow();
  });

  it('evaluates exists / notExists / between', () => {
    expect(evaluateCondition(cond.exists('user.age'), facts)).toBe(true);
    expect(evaluateCondition(cond.notExists('user.phone'), facts)).toBe(true);
    expect(evaluateCondition(cond.exists('empty'), facts)).toBe(true); // null counts as existing
    expect(evaluateCondition(cond.between('order.total', 100, 500), facts)).toBe(true);
    expect(evaluateCondition(cond.between('order.total', 300, 500), facts)).toBe(false);
  });

  it('evaluates nested AND/OR/NOT', () => {
    const adult = cond.gte('user.age', 18);
    const acme = cond.endsWith('user.email', 'acme.com');
    const vip = cond.contains('user.roles', 'vip');
    expect(evaluateCondition(cond.and(adult, acme), facts)).toBe(true);
    expect(evaluateCondition(cond.and(adult, vip), facts)).toBe(false);
    expect(evaluateCondition(cond.or(vip, acme), facts)).toBe(true);
    expect(evaluateCondition(cond.not(vip), facts)).toBe(true);
    expect(evaluateCondition(cond.and(adult, cond.or(vip, acme), cond.not(cond.exists('user.phone'))), facts)).toBe(true);
    // Empty conjunction is true, empty disjunction false.
    expect(evaluateCondition(cond.always(), facts)).toBe(true);
    expect(evaluateCondition(cond.never(), facts)).toBe(false);
  });

  it('deepEqual handles nested structures and arrays', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqual(new Date(1000), new Date(1000))).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(evaluateCondition(cond.eq('order.items', [{ sku: 'A' }, { sku: 'B' }]), facts)).toBe(true);
  });
});

describe('WorkingMemory + TMS', () => {
  let wm: WorkingMemory;
  beforeEach(() => {
    wm = new WorkingMemory(() => 1000);
  });

  it('asserts and retracts premise facts', () => {
    wm.assert('a', { v: 1 });
    expect(wm.has('a')).toBe(true);
    expect(wm.get('a')?.data).toEqual({ v: 1 });
    expect(wm.retract('a')).toEqual(['a']);
    expect(wm.has('a')).toBe(false);
  });

  it('cascades retraction through derived facts', () => {
    wm.assert('p1', { x: 1 });
    wm.assertDerived('d1', { y: 2 }, 'rule1', ['p1']);
    wm.assertDerived('d2', { z: 3 }, 'rule2', ['d1']);
    const removed = wm.retract('p1');
    expect(removed.sort()).toEqual(['d1', 'd2', 'p1'].sort());
    expect(wm.size).toBe(0);
  });

  it('keeps derived fact alive while another justification holds', () => {
    wm.assert('p1', {});
    wm.assert('p2', {});
    wm.assertDerived('d', {}, 'r1', ['p1']);
    wm.assertDerived('d', {}, 'r2', ['p2']);
    wm.retract('p1');
    expect(wm.has('d')).toBe(true);
    wm.retract('p2');
    expect(wm.has('d')).toBe(false);
  });

  it('premise facts are not cascade-removed when dependents lose support', () => {
    wm.assert('ground', { g: true });
    wm.assertDerived('ground', { extra: 1 }, 'r', ['missing']);
    expect(wm.get('ground')?.data).toEqual({ g: true });
  });

  it('tracks recency for conflict resolution', () => {
    wm.assert('old', {});
    wm.assert('new', {});
    const [first] = wm.query(() => true);
    expect(first.id).toBe('new');
  });

  it('flattened fact object exposes fact ids and record fields', () => {
    wm.assert('user', { age: 30, name: 'x' });
    const obj = wm.toFactObject();
    expect(obj.user).toEqual({ age: 30, name: 'x' });
    expect(obj.age).toBe(30);
  });
});

describe('ProductionRuleEngine', () => {
  let engine: ProductionRuleEngine;
  beforeEach(() => {
    engine = new ProductionRuleEngine({ clock: () => 42 });
  });

  it('fires matching rules in priority order', async () => {
    const order: string[] = [];
    const mk = (id: string, priority: number): Rule => ({
      id,
      priority,
      condition: cond.always(),
      action: () => {
        order.push(id);
      },
    });
    engine.addRule(mk('low', 1));
    engine.addRule(mk('high', 10));
    engine.addRule(mk('mid', 5));
    const result = await engine.run({});
    expect(order).toEqual(['high', 'mid', 'low']);
    expect(result.cycles).toBe(3);
  });

  it('short-circuits on a terminal rule', async () => {
    const order: string[] = [];
    engine.addRule({
      id: 'deny',
      priority: 100,
      shortCircuit: true,
      condition: cond.eq('input.banned', true),
      action: (ctx) => {
        order.push('deny');
        ctx.output.decision = 'DENY';
      },
    });
    engine.addRule({
      id: 'allow',
      priority: 1,
      condition: cond.always(),
      action: () => {
        order.push('allow');
      },
    });
    const result = await engine.run({ input: { banned: true } });
    expect(order).toEqual(['deny']);
    expect(result.halted).toBe(true);
    expect(result.output.decision).toBe('DENY');
  });

  it('chains rules through provides/requires', async () => {
    engine.addRule({
      id: 'compute-score',
      condition: cond.always(),
      provides: ['score'],
      action: (ctx) => {
        ctx.output.score = (ctx.facts.input as { base: number }).base * 2;
        ctx.produce !== undefined; // ctx has no produce; provides handled by engine
      },
    });
    engine.addRule({
      id: 'use-score',
      requires: ['score'],
      condition: cond.always(),
      action: (ctx) => {
        ctx.output.derived = (ctx.output.score as number) + 1;
      },
    });
    const result = await engine.run({ input: { base: 21 } });
    expect(result.output.score).toBe(42);
    expect(result.output.derived).toBe(43);
  });

  it('forward chaining: asserted fact activates downstream rule', async () => {
    const fired: string[] = [];
    engine.addRule({
      id: 'detect-adult',
      condition: cond.gte('input.age', 18),
      provides: ['isAdult'],
      action: (ctx) => {
        fired.push('detect-adult');
        ctx.assertFact('isAdult', { value: true });
      },
    });
    engine.addRule({
      id: 'grant-access',
      requires: ['isAdult'],
      condition: cond.eq('isAdult.value', true),
      action: (ctx) => {
        fired.push('grant-access');
        ctx.output.access = true;
      },
    });
    const result = await engine.run({ input: { age: 30 } });
    expect(fired).toEqual(['detect-adult', 'grant-access']);
    expect(result.output.access).toBe(true);
  });

  it('honors refraction — rules do not re-fire on unchanged facts', async () => {
    let count = 0;
    engine.addRule({
      id: 'counting',
      condition: cond.always(),
      action: () => {
        count++;
      },
    });
    const result = await engine.run({});
    expect(count).toBe(1);
    expect(result.cycles).toBe(1);
  });

  it('re-fires when fact population changes between cycles', async () => {
    engine.addRule({
      id: 'seed',
      priority: 10,
      condition: cond.always(),
      action: (ctx) => {
        ctx.assertFact('tick', { n: 1 });
      },
    });
    let derived = 0;
    engine.addRule({
      id: 'react',
      condition: cond.exists('tick'),
      action: () => {
        derived++;
      },
    });
    const result = await engine.run({});
    expect(derived).toBe(1);
    expect(result.cycles).toBe(2);
  });

  it('respects maxCycles as a safety bound', async () => {
    const bounded = new ProductionRuleEngine({ maxCycles: 5 });
    let i = 0;
    bounded.addRule({
      id: 'loop',
      condition: cond.always(),
      // Re-assert a *new* fact id each time → population changes → refires.
      action: (ctx) => {
        i++;
        ctx.assertFact(`f${i}`, {});
      },
    });
    // Disable refraction so the same rule can reactivate on the changed memory.
    const noRefr = new ProductionRuleEngine({ maxCycles: 5, refraction: false });
    noRefr.addRule({
      id: 'loop',
      condition: cond.always(),
      action: (ctx) => {
        i++;
        ctx.assertFact(`g${i}`, {});
      },
    });
    const result = await noRefr.run({});
    expect(result.truncated).toBe(true);
    expect(result.cycles).toBe(5);
  });

  it('conflict resolution prefers specificity over recency when configured', async () => {
    const order: string[] = [];
    const e = new ProductionRuleEngine({ conflictResolution: ['specificity'] });
    e.addRule({
      id: 'broad',
      condition: cond.exists('input'),
      action: () => {
        order.push('broad');
      },
    });
    e.addRule({
      id: 'narrow',
      condition: cond.and(cond.exists('input'), cond.gte('input.n', 0), cond.lte('input.n', 100)),
      action: () => {
        order.push('narrow');
      },
    });
    await e.run({ input: { n: 5 } });
    expect(order[0]).toBe('narrow');
  });

  it('truth maintenance: retracting a premise undoes derived facts', async () => {
    engine.addRule({
      id: 'derive',
      condition: cond.eq('input.active', true),
      action: (ctx) => {
        ctx.assertDerived('session', { live: true });
      },
    });
    engine.addRule({
      id: 'cleanup',
      priority: -1,
      condition: cond.and(cond.exists('session'), cond.eq('input.shutdown', true)),
      action: (ctx) => {
        ctx.retractFact('input');
      },
    });
    const result = await engine.run({ input: { active: true, shutdown: true } });
    expect(engine.memory.has('session')).toBe(false);
    expect(result.fired.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PriorityEvaluationStrategy', () => {
  it('returns the first terminal match by priority', () => {
    const s = new PriorityEvaluationStrategy();
    s.addRule({ id: 'default', priority: 0, when: cond.always(), then: () => 'default' });
    s.addRule({ id: 'vip', priority: 50, when: cond.eq('tier', 'vip'), then: () => 'vip-price' });
    s.addRule({ id: 'premium', priority: 30, when: cond.eq('tier', 'premium'), then: () => 'prem' });
    const out = s.evaluate({ tier: 'vip' });
    expect(out.decision?.ruleId).toBe('vip');
    expect(out.decision?.output).toBe('vip-price');
    expect(out.matches.length).toBe(1);
  });

  it('accumulates non-terminal matches', () => {
    const s = new PriorityEvaluationStrategy();
    s.addRule({ id: 'd1', priority: 10, terminal: false, when: cond.always(), then: () => 10 });
    s.addRule({ id: 'd2', priority: 5, terminal: false, when: cond.always(), then: () => 5 });
    const out = s.evaluate({});
    expect(out.matches.length).toBe(2);
    expect(out.decision?.output).toBe(5);
  });

  it('skips rules with unmet requires', () => {
    const s = new PriorityEvaluationStrategy();
    s.addRule({ id: 'needs-key', priority: 10, requires: ['k'], when: cond.always(), then: () => 'x' });
    s.addRule({ id: 'provides-key', priority: 1, terminal: false, when: cond.always(), provides: ['k'], then: () => 'v' });
    const out = s.evaluate({});
    // needs-key evaluated first (higher priority), skipped; provides-key then produces k.
    expect(out.skipped).toContain('needs-key');
    expect(out.decision?.ruleId).toBe('provides-key');
  });

  it('execute wraps evaluate in a RulesEngineResult', async () => {
    const s = new PriorityEvaluationStrategy();
    s.addRule({ id: 'r', when: cond.eq('x', 1), then: () => 'one' });
    const result = await s.execute({ input: { x: 1 }, metadata: {}, timestamp: new Date() });
    expect(result.success).toBe(true);
    const data = result.data as { decision: { ruleId: string } };
    expect(data.decision.ruleId).toBe('r');
    expect(s.getExecutionCount()).toBe(1);
  });
});

describe('ForwardChainingStrategy', () => {
  it('inferred facts produce an explanation chain', async () => {
    const s = new ForwardChainingStrategy({ clock: () => 7 });
    s.addRule({
      id: 'r1',
      condition: cond.gte('input.temp', 100),
      provides: ['hot'],
      action: (ctx) => ctx.assertDerived('hot', { v: true }),
    });
    s.addRule({
      id: 'r2',
      requires: ['hot'],
      condition: cond.exists('hot'),
      action: (ctx) => ctx.assertDerived('alarm', { level: 'red' }),
    });
    const result = await s.infer({ input: { temp: 120 } });
    expect(s.memory.has('alarm')).toBe(true);
    const explanation = s.explain('alarm');
    expect(explanation).toBeDefined();
    expect(explanation!.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.residentFacts).toContain('alarm');
  });

  it('runUntil reports goal satisfaction', async () => {
    const s = new ForwardChainingStrategy();
    s.addRule({
      id: 'diagnose',
      condition: cond.exists('input.symptom'),
      provides: ['diagnosis'],
      action: (ctx) => ctx.assertDerived('diagnosis', { code: 'FLU' }),
    });
    const hit = await s.runUntil({ input: { symptom: 'fever' } }, (facts) => 'diagnosis' in facts);
    expect(hit.goalReached).toBe(true);
    const miss = await (() => {
      const s2 = new ForwardChainingStrategy();
      s2.addRule({ id: 'noop', condition: cond.eq('x', 1), action: () => undefined });
      return s2.runUntil({}, (f) => 'diagnosis' in f);
    })();
    expect(miss.goalReached).toBe(false);
  });

  it('trace buffer is bounded (ring)', async () => {
    const s = new ForwardChainingStrategy({ traceCapacity: 4 });
    for (let i = 0; i < 8; i++) {
      s.addRule({
        id: `r${i}`,
        priority: -i,
        requires: i === 0 ? [] : [`k${i - 1}`],
        provides: [`k${i}`],
        condition: cond.always(),
        action: () => undefined,
      });
    }
    await s.infer({});
    const entries = s.trace.entries();
    expect(entries.length).toBeLessThanOrEqual(4);
    // Oldest entries evicted — seq numbers are the tail of the stream.
    expect(entries[entries.length - 1].seq).toBeGreaterThanOrEqual(4);
  });
});
