/**
 * Canary Deploy extras 2 — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { MetricRegistry } from '../canary/MetricRegistry';
import { SloBudget } from '../canary/SloBudget';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

// --------------------------------------------------------------- MetricRegistry

describe('MetricRegistry', () => {
  it('deriveGate builds gates from registered defaults', () => {
    const r = new MetricRegistry();
    r.registerStandardSet();
    const g = r.deriveGate('error-rate');
    expect(g.metric).toBe('error-rate');
    expect(g.mode).toBe('absolute');
    expect(g.threshold).toBe(0.05);
    expect(g.minSamples).toBe(30);
  });

  it('overrides win over registered defaults', () => {
    const r = new MetricRegistry();
    r.registerStandardSet();
    const g = r.deriveGate('latency-p99', { toleranceRatio: 0.5, minSamples: 100 });
    expect(g.toleranceRatio).toBe(0.5);
    expect(g.minSamples).toBe(100);
  });

  it('custom metrics carry their name through to customName', () => {
    const r = new MetricRegistry();
    r.register({
      name: 'queue-depth',
      kind: 'custom',
      higherIsWorse: true,
      unit: 'count',
      defaults: { mode: 'absolute', threshold: 1000 },
    });
    const g = r.deriveGate('queue-depth');
    expect(g.metric).toBe('custom');
    expect(g.customName).toBe('queue-depth');
  });

  it('rejects duplicates and unknown metrics', () => {
    const r = new MetricRegistry();
    r.registerStandardSet();
    expect(() => r.register({ name: 'error-rate', kind: 'error-rate', higherIsWorse: true, unit: 'x', defaults: {} })).toThrow();
    expect(() => r.deriveGate('ghost')).toThrow(/unknown metric/);
  });
});

// -------------------------------------------------------------------- SloBudget

describe('SloBudget', () => {
  it('computes burn rate vs allowed errors', () => {
    const b = new SloBudget({ target: 0.99, windowMs: 86_400_000 });
    b.record(1, 1000); // 0.1% errors vs 1% allowed → burn 0.1
    const s = b.status();
    expect(s.burnRate).toBeCloseTo(0.1);
    expect(s.exceeding).toBe(false);
    expect(s.allowedErrors).toBeCloseTo(10);
  });

  it('exceeds when errors outpace the SLO', () => {
    const b = new SloBudget({ target: 0.99, windowMs: 86_400_000 });
    b.record(50, 1000); // 5% errors vs 1% allowed → burn 5
    expect(b.status().exceeding).toBe(true);
    expect(b.status().burnRate).toBeCloseTo(5);
  });

  it('remainingBudgetErrors tracks absolute room', () => {
    const b = new SloBudget({ target: 0.9, windowMs: 1000 });
    b.record(5, 100); // allowed 10, used 5
    expect(b.remainingBudgetErrors()).toBeCloseTo(5);
    b.record(20, 100); // errors 25 > allowed 20 → clamped to 0
    expect(b.remainingBudgetErrors()).toBe(0);
  });

  it('reset zeroes the budget window', () => {
    const clk = fakeClock();
    const b = new SloBudget({ target: 0.99, windowMs: 1000 }, clk.now);
    b.record(10, 100);
    b.reset();
    expect(b.status().observedErrors).toBe(0);
  });
});
