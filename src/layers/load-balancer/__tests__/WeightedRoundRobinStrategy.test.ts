/**
 * Tests for WeightedRoundRobinStrategy (smooth WRR).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { WeightedRoundRobinStrategy } from '../strategies/WeightedRoundRobinStrategy';
import { createBackend, createPoolEntry } from '../types/backend';

function pool(weights: number[]) {
  return weights.map((w, i) =>
    createPoolEntry(createBackend(`b${i}`, `10.0.0.${i}`, 8080, { weight: w }))
  );
}

describe('WeightedRoundRobinStrategy', () => {
  let strat: WeightedRoundRobinStrategy;

  beforeEach(() => {
    strat = new WeightedRoundRobinStrategy();
  });

  it('has correct name', () => {
    expect(strat.name).toBe('weighted-round-robin');
  });

  it('selects proportionally to weight over a period', () => {
    const entries = pool([3, 1, 1]); // total = 5
    const counts = new Map<string, number>();
    for (let i = 0; i < 50; i++) {
      const sel = strat.select(entries, {})!;
      counts.set(sel.backend.id, (counts.get(sel.backend.id) ?? 0) + 1);
    }
    expect(counts.get('b0')).toBe(30);
    expect(counts.get('b1')).toBe(10);
    expect(counts.get('b2')).toBe(10);
  });

  it('interleaves smoothly rather than clumping (nginx-style)', () => {
    const entries = pool([5, 1, 1]);
    const seq: string[] = [];
    for (let i = 0; i < 7; i++) {
      seq.push(strat.select(entries, {})!.backend.id);
    }
    // Naive WRR would emit b0 b0 b0 b0 b0 b1 b2.
    // Smooth WRR interleaves: first 7 picks should not be 5×b0 in a row.
    const firstFive = seq.slice(0, 5);
    expect(new Set(firstFive).size).toBeGreaterThan(1);
    // And over 7 picks, b0 appears exactly 5 times.
    expect(seq.filter((x) => x === 'b0').length).toBe(5);
  });

  it('respects equal weights as plain RR', () => {
    const entries = pool([1, 1, 1]);
    const seq = [0, 1, 2, 3].map(() => strat.select(entries, {})!.backend.id);
    // With equal weights, order may start with b0 then rotate.
    expect(seq.length).toBe(4);
    const counts = new Map<string, number>();
    seq.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    // After 4 picks on 3 equal backends, distribution is 2-1-1 in some order.
    const sorted = [...counts.values()].sort((a, b) => a - b);
    expect(sorted).toEqual([1, 1, 2]);
  });

  it('degraded backend receives ~1/10 of its weight', () => {
    const entries = pool([10, 10]);
    entries[1].status = 'degraded';
    const counts = new Map<string, number>();
    for (let i = 0; i < 110; i++) {
      const sel = strat.select(entries, {})!;
      counts.set(sel.backend.id, (counts.get(sel.backend.id) ?? 0) + 1);
    }
    // b0 weight 10, b1 effective 1 → b1 ≈ 10 out of 110.
    expect(counts.get('b1')!).toBeLessThanOrEqual(15);
    expect(counts.get('b0')!).toBeGreaterThanOrEqual(95);
  });

  it('rebuilds schedule when backend removed', () => {
    const entries = pool([1, 1]);
    entries.forEach((e) => strat.onBackendAdded(e));
    strat.select(entries, {});
    strat.onBackendRemoved(entries[1]);
    expect(strat.getCurrentWeights().has('b1')).toBe(false);
    const only = [entries[0]];
    for (let i = 0; i < 3; i++) {
      expect(strat.select(only, {})!.backend.id).toBe('b0');
    }
  });

  it('returns undefined for empty pool', () => {
    expect(strat.select([], {})).toBeUndefined();
  });
});
