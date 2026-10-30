/**
 * Rules Engine engine2 — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RuleVersionStore, RuleVersionError, VersionedRule } from '../engine2/RuleVersionStore';
import { RuleProfiler } from '../engine2/RuleProfiler';
import { RuleConflictDetector } from '../engine2/RuleConflictDetector';
import { AlphaNetwork } from '../engine2/AlphaNetwork';
import { cond } from '../domain/dsl';

function rule(id: string, condition: import('../domain/dsl').Condition, action = `act-${id}`): VersionedRule {
  return { id, condition, action };
}

// ------------------------------------------------------------ RuleVersionStore

describe('RuleVersionStore', () => {
  const mc = (() => { let t = 1000; return { clock: () => t, adv: (ms: number) => { t += ms; } }; })();
  let store: RuleVersionStore;

  beforeEach(() => {
    store = new RuleVersionStore('discount-rules', mc.clock);
  });

  it('publishes immutable, numbered versions', () => {
    const v1 = store.publish({ name: 'discount-rules', rules: [rule('r1', cond.always())] }, 'initial');
    expect(v1.version).toBe(1);
    const v2 = store.publish({ name: 'discount-rules', rules: [rule('r1', cond.always()), rule('r2', cond.never())] }, 'add r2');
    expect(v2.version).toBe(2);
    expect(v2.parent).toBe(1);
    expect(store.checkout(1).rules).toHaveLength(1); // v1 untouched
  });

  it('rejects duplicate rule ids and wrong names', () => {
    expect(() =>
      store.publish({ name: 'discount-rules', rules: [rule('x', cond.always()), rule('x', cond.never())] })
    ).toThrow(RuleVersionError);
    expect(() => store.publish({ name: 'other', rules: [] })).toThrow(RuleVersionError);
  });

  it('diffs versions — added/removed/modified', () => {
    store.publish({ name: 'discount-rules', rules: [rule('a', cond.gt('x', 1)), rule('b', cond.always())] });
    store.publish({
      name: 'discount-rules',
      rules: [rule('a', cond.gt('x', 2), 'act-a'), rule('c', cond.always())], // b removed, a modified, c added
    });
    const d = store.diff(1, 2);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.modified).toBe(1);
    const a = d.changes.find((c) => c.ruleId === 'a')!;
    expect(a.kind).toBe('modified');
    expect(a.changedFields).toContain('condition');
  });

  it('rollback publishes a new version equal to the target', () => {
    store.publish({ name: 'discount-rules', rules: [rule('a', cond.always())] });
    store.publish({ name: 'discount-rules', rules: [rule('a', cond.never())] });
    const v3 = store.rollbackTo(1);
    expect(v3.version).toBe(3);
    expect(store.checkout(3).rules[0].condition).toEqual(cond.always());
    expect(store.history()).toHaveLength(3);
  });
});

// ------------------------------------------------------------ RuleProfiler

describe('RuleProfiler', () => {
  it('accumulates per-rule timing stats', () => {
    let t = 0;
    const profiler = new RuleProfiler(() => t);
    const r = rule('r1', cond.gt('x', 5));
    t = 0;
    profiler.profiled(r, { x: 10 });
    // simulate elapsed manually — real clock is performance.now; we just check stats exist
    const s = profiler.stats('r1')!;
    expect(s.calls).toBe(1);
    expect(s.matchRate).toBe(1);
  });

  it('tracks match rate across calls', () => {
    const profiler = new RuleProfiler();
    const r = rule('r1', cond.gt('x', 5));
    profiler.profiled(r, { x: 10 });
    profiler.profiled(r, { x: 1 });
    profiler.profiled(r, { x: 20 });
    expect(profiler.stats('r1')!.matchRate).toBeCloseTo(2 / 3);
  });

  it('slowest() orders by total time', () => {
    const profiler = new RuleProfiler();
    profiler.recordExternal('slow', 100, true);
    profiler.recordExternal('fast', 1, true);
    profiler.recordExternal('mid', 50, true);
    const s = profiler.slowest(3);
    expect(s.map((x) => x.ruleId)).toEqual(['slow', 'mid', 'fast']);
  });

  it('conditionBreakdown reports per-node timings', () => {
    const profiler = new RuleProfiler();
    const c = cond.and(cond.gt('a', 1), cond.eq('b', 'x'));
    const timings = profiler.conditionBreakdown(c, { a: 5, b: 'x' });
    expect(timings.find((t) => t.path === 'root')!.kind).toBe('and');
    expect(timings.filter((t) => t.kind === 'leaf')).toHaveLength(2);
    expect(timings.every((t) => t.result)).toBe(true);
  });
});

// ------------------------------------------------------------ RuleConflictDetector

describe('RuleConflictDetector', () => {
  const detector = new RuleConflictDetector();

  it('flags identical conditions with different actions', () => {
    const conflicts = detector.detect([
      rule('a', cond.and(cond.gt('age', 18), cond.eq('vip', true)), 'approve'),
      rule('b', cond.and(cond.gt('age', 18), cond.eq('vip', true)), 'deny'),
    ]);
    const c = conflicts.find((x) => x.kind === 'identical-conditions');
    expect(c).toBeDefined();
    expect(c!.ruleA).toBe('a');
    expect(c!.ruleB).toBe('b');
  });

  it('flags equivalent rules (same condition+action) as redundancy', () => {
    const conflicts = detector.detect([
      rule('a', cond.eq('x', 1), 'same'),
      rule('b', cond.eq('x', 1), 'same'),
    ]);
    expect(conflicts[0].kind).toBe('equivalent');
  });

  it('detects shadowing: superset condition masks a subset rule', () => {
    // 'a' requires age>18 only; 'b' requires age>18 AND vip — a shadows b.
    const conflicts = detector.detect([
      rule('a', cond.gt('age', 18), 'approve'),
      rule('b', cond.and(cond.gt('age', 18), cond.eq('vip', true)), 'deny'),
    ]);
    const c = conflicts.find((x) => x.kind === 'shadowed');
    expect(c).toBeDefined();
    expect(c!.ruleA).toBe('a');
    expect(c!.ruleB).toBe('b');
  });

  it('proves overlap when shared fields are co-satisfiable', () => {
    const conflicts = detector.detect([
      rule('a', cond.gt('x', 0), 'allow'),
      rule('b', cond.lt('x', 100), 'deny'),
    ]);
    // x>0 and x<100 can co-hold (e.g. x=50) — proven overlap.
    const c = conflicts.find((x) => x.kind === 'overlap');
    expect(c).toBeDefined();
    expect(c!.certainty).toBe('proven');
  });

  it('does NOT report provably-disjoint conditions', () => {
    const conflicts = detector.detect([
      rule('a', cond.gt('x', 100), 'allow'),
      rule('b', cond.lt('x', 50), 'deny'),
    ]);
    expect(conflicts.filter((c) => c.kind !== 'equivalent')).toHaveLength(0);
  });

  it('detects contradictions via == vs range', () => {
    const conflicts = detector.detect([
      rule('a', cond.eq('tier', 'gold'), 'x'),
      rule('b', cond.eq('tier', 'silver'), 'y'),
    ]);
    expect(conflicts).toHaveLength(0); // tier can't be both → no conflict
  });
});

// ------------------------------------------------------------ AlphaNetwork

describe('AlphaNetwork', () => {
  let net: AlphaNetwork;
  beforeEach(() => {
    net = new AlphaNetwork();
  });

  it('activates rules whose shared leaves all pass', () => {
    net.compile([
      rule('vip-discount', cond.and(cond.eq('tier', 'vip'), cond.gt('total', 100))),
      rule('bday-discount', cond.eq('coupon', 'BDAY')),
    ]);
    const hits = net.match({ tier: 'vip', total: 150 });
    expect(hits.map((r) => r.id)).toEqual(['vip-discount']);
  });

  it('shares identical leaves across rules — fewer evaluations', () => {
    net.compile([
      rule('a', cond.and(cond.eq('tier', 'vip'), cond.gt('total', 100))),
      rule('b', cond.and(cond.eq('tier', 'vip'), cond.gt('total', 500))),
      rule('c', cond.and(cond.eq('tier', 'vip'), cond.eq('region', 'us'))),
    ]);
    // 3 distinct leaves across all rules: tier==vip (shared ×3), total>100, total>500, region==us → 4 nodes
    net.match({ tier: 'vip', total: 200, region: 'us' });
    const s = net.stats();
    expect(s.alphaNodes).toBe(4);
    expect(s.lastLeafEvaluations).toBeLessThan(s.naiveLeafEvaluations);
    expect(s.sharingRatio).toBeGreaterThan(1);
  });

  it('skips leaves whose field is absent (except notExists)', () => {
    net.compile([
      rule('a', cond.gt('missing', 5)),
      rule('b', cond.notExists('ghost')),
    ]);
    const hits = net.match({ other: 1 });
    // 'a' can't fire (missing field); 'b' fires because ghost absent.
    expect(hits.map((r) => r.id)).toEqual(['b']);
    const stats = net.stats();
    // notExists leaf evaluated eagerly; gt leaf skipped (field absent)
    expect(stats.lastLeafEvaluations).toBe(1);
  });

  it('handles residual or/not conditions correctly', () => {
    net.compile([
      rule(
        'combo',
        cond.and(
          cond.eq('tier', 'vip'),
          cond.or(cond.eq('coupon', 'A'), cond.eq('coupon', 'B'))
        )
      ),
    ]);
    expect(net.match({ tier: 'vip', coupon: 'B' })).toHaveLength(1);
    expect(net.match({ tier: 'vip', coupon: 'C' })).toHaveLength(0);
    expect(net.match({ tier: 'std', coupon: 'A' })).toHaveLength(0);
  });

  it('recompiles atomically on new rule sets', () => {
    net.compile([rule('a', cond.eq('x', 1))]);
    expect(net.match({ x: 1 })).toHaveLength(1);
    net.compile([rule('b', cond.eq('x', 2))]);
    expect(net.match({ x: 1 })).toHaveLength(0);
    expect(net.match({ x: 2 })).toHaveLength(1);
  });
});
