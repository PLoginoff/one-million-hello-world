/**
 * Data contract DSL tests.
 */

import { describe, it, expect } from 'bun:test';
import { QualityEngine, ValidityRule } from '../engine/QualityRules';
import { checkSchemaConformance, defineContract } from '../engine/Contracts';
import type { DQRow } from '../engine/QualityRules';

const ORDERS: DQRow[] = [
  { id: 1, email: 'a@x.com', amount: 50, status: 'paid', start: 1, end: 2 },
  { id: 2, email: 'b@x.com', amount: 150, status: 'pending', start: 3, end: 9 },
  { id: 3, email: 'nope', amount: -5, status: 'weird', start: 5, end: 4 },
];

function buildContract() {
  return defineContract('orders')
    .owner('data-team')
    .describe('orders table contract')
    .column('id', (c) => c.notNull().unique().type('number'))
    .column('email', (c) => c.email().notNull(0.9))
    .column('amount', (c) => c.range(0, 1_000_000))
    .column('status', (c) => c.oneOf(['paid', 'pending', 'cancelled']))
    .rowLevel('startBeforeEnd', 'start must be < end', (r) => (r.start as number) < (r.end as number), ['start', 'end'])
    .build();
}

describe('ContractBuilder', () => {
  it('compiles column expectations into rules', () => {
    const contract = buildContract();
    expect(contract.name).toBe('orders');
    expect(contract.owner).toBe('data-team');
    // id: 3 rules; email: 2; amount: 1; status: 1; rowLevel: 1 → 8
    expect(contract.rules.length).toBe(8);
  });

  it('generated rules detect violations end-to-end', () => {
    const contract = buildContract();
    const engine = new QualityEngine();
    engine.addRules(contract.rules);
    const report = engine.evaluate(ORDERS);
    const byRule = new Map(report.ruleResults.map((r) => [r.ruleId, r]));
    expect(byRule.get('orders.email.email')?.violationCount).toBe(1);
    expect(byRule.get('orders.amount.range')?.violationCount).toBe(1);
    expect(byRule.get('orders.status.enum')?.violationCount).toBe(1);
    expect(byRule.get('orders.startBeforeEnd')?.violationCount).toBe(1);
  });

  it('clean data passes contract', () => {
    const contract = buildContract();
    const engine = new QualityEngine();
    engine.addRules(contract.rules);
    const clean = ORDERS.slice(0, 2);
    const report = engine.evaluate(clean);
    expect(report.status).toBe('pass');
  });

  it('uniqueTogether generates composite uniqueness', () => {
    const contract = defineContract('t').uniqueTogether(['a', 'b']).build();
    expect(contract.rules.length).toBe(1);
    const engine = new QualityEngine();
    engine.addRules(contract.rules);
    const rows = [{ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 1, b: 2 }];
    expect(engine.evaluate(rows).violations.length).toBe(1);
  });

  it('predicate expectation supports custom logic', () => {
    const contract = defineContract('t')
      .column('code', (c) => c.predicate('starts with X', (v) => typeof v === 'string' && v.startsWith('X')))
      .build();
    const engine = new QualityEngine();
    engine.addRules(contract.rules);
    const report = engine.evaluate([{ code: 'X1' }, { code: 'Y2' }]);
    expect(report.violations.length).toBe(1);
  });
});

describe('checkSchemaConformance', () => {
  it('detects missing and unexpected columns', () => {
    const contract = defineContract('t').column('a', (c) => c).column('b', (c) => c).build();
    const rows = [{ a: 1, c: 'x' }];
    const report = checkSchemaConformance(contract, rows);
    expect(report.missingColumns).toEqual(['b']);
    expect(report.unexpectedColumns).toEqual(['c']);
    expect(report.conforming).toBe(false);
  });

  it('detects type mismatches vs declared types', () => {
    const contract = defineContract('t').column('n', (c) => c.type('number')).build();
    const report = checkSchemaConformance(contract, [{ n: 'oops' }]);
    expect(report.typeMismatches.length).toBe(1);
    expect(report.typeMismatches[0].observed).toEqual(['string']);
  });

  it('conforming data passes', () => {
    const contract = defineContract('t').column('n', (c) => c.type('number')).column('s', (c) => c).build();
    const report = checkSchemaConformance(contract, [{ n: 1, s: 'x' }]);
    expect(report.conforming).toBe(true);
  });

  it('null values do not count as type mismatch', () => {
    const contract = defineContract('t').column('n', (c) => c.type('number')).build();
    const report = checkSchemaConformance(contract, [{ n: null }, { n: 5 }]);
    expect(report.conforming).toBe(true);
  });
});

describe('ValidityRule predicate inside contract', () => {
  it('predicate constraint surfaces description in message', () => {
    const r = new ValidityRule('p', 'pred', 'v', { kind: 'predicate', test: (v) => v === 'ok', description: 'must equal ok' });
    const vs = r.evaluate({ rows: [{ v: 'bad' }], now: 0 });
    expect(vs[0].message).toContain('must equal ok');
  });
});
