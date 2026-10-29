/**
 * Baseline store & rule catalog tests.
 */

import { describe, it, expect } from 'bun:test';
import { BaselineStore, RuleCatalog } from '../engine/Baselines';
import { QualityEngine } from '../engine/QualityRules';
import type { DQRow } from '../engine/QualityRules';

function batch(n: number, opts: { nullEvery?: number; vBase?: number } = {}): DQRow[] {
  const rows: DQRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i,
      email: i % (opts.nullEvery ?? 50) === 0 ? null : `u${i}@x.com`,
      amount: (opts.vBase ?? 100) + (i % 10),
    });
  }
  return rows;
}

describe('BaselineStore', () => {
  it('learns baseline over several observations', () => {
    const s = new BaselineStore();
    for (let i = 0; i < 5; i++) s.observe('orders', batch(100), ['email', 'amount']);
    const dev = s.deviation('orders', batch(100), ['email', 'amount']);
    // Same distribution → no anomalies
    for (const r of dev) expect(r.anomalous).toBe(false);
  });

  it('flags a sudden null-ratio spike', () => {
    const s = new BaselineStore({ zThreshold: 3 });
    // Baseline: 2% nulls consistently (nullEvery=50 → ~2%)
    for (let i = 0; i < 8; i++) s.observe('orders', batch(200, { nullEvery: 50 }), ['email']);
    // Now 50% nulls — way outside learned distribution.
    const dev = s.deviation('orders', batch(200, { nullEvery: 2 }), ['email']);
    const report = dev.find((d) => d.column === 'email');
    expect(report?.anomalous).toBe(true);
    const nullDev = report?.deviations.find((d) => d.metric === 'nullRatio');
    expect(nullDev?.zScore).toBeGreaterThan(3);
  });

  it('flags mean shift on numeric column', () => {
    const s = new BaselineStore({ zThreshold: 3 });
    for (let i = 0; i < 8; i++) s.observe('orders', batch(200, { vBase: 100 }), ['amount']);
    const dev = s.deviation('orders', batch(200, { vBase: 500 }), ['amount']);
    const r = dev.find((d) => d.column === 'amount');
    expect(r?.deviations.some((d) => d.metric === 'mean' && d.anomalous)).toBe(true);
  });

  it('suggestRules emits learned thresholds', () => {
    const s = new BaselineStore();
    for (let i = 0; i < 5; i++) s.observe('orders', batch(200), ['email', 'amount']);
    const rules = s.suggestRules('orders', 'email');
    expect(rules.length).toBeGreaterThan(0);
    // Generated rules should pass on in-distribution data
    const engine = new QualityEngine();
    engine.addRules(rules);
    const report = engine.evaluate(batch(200));
    expect(report.ruleResults.every((r) => r.passed)).toBe(true);
  });
});

describe('RuleCatalog', () => {
  it('standard library instantiates working rules', () => {
    const cat = RuleCatalog.standard();
    expect(cat.list().map((t) => t.id)).toContain('range');
    const rule = cat.instantiate('range', { column: 'age', min: 0, max: 120 });
    const vs = rule.evaluate({ rows: [{ age: 200 }], now: 0 });
    expect(vs.length).toBe(1);
  });

  it('throws on missing parameters', () => {
    const cat = RuleCatalog.standard();
    expect(() => cat.instantiate('enum', { column: 'x' })).toThrow("Missing parameter 'allowed'");
  });

  it('throws on unknown template', () => {
    const cat = RuleCatalog.standard();
    expect(() => cat.instantiate('nope', {})).toThrow('Unknown rule template');
  });

  it('custom template registration', () => {
    const cat = new RuleCatalog();
    cat.register({
      id: 'startsWith',
      description: 'string starts with prefix',
      parameters: ['column', 'prefix'],
      build: (p) => {
        return {
          id: 'sw', name: 'startsWith', dimension: 'validity', severity: 'error' as const,
          evaluate: (ctx: { rows: readonly Record<string, unknown>[] }) =>
            ctx.rows.flatMap((r: Record<string, unknown>, i: number) =>
              typeof r[p.column as string] === 'string' && (r[p.column as string] as string).startsWith(String(p.prefix))
                ? []
                : [{ ruleId: 'sw', ruleName: 'sw', dimension: 'validity' as const, rowIndex: i, message: 'bad prefix', severity: 'error' as const }]
            ),
        };
      },
    });
    const rule = cat.instantiate('startsWith', { column: 'code', prefix: 'X' });
    const vs = rule.evaluate({ rows: [{ code: 'X1' }, { code: 'Y1' }], now: 0 });
    expect(vs.length).toBe(1);
  });
});
