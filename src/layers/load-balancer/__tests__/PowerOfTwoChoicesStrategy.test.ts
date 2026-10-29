/**
 * Tests for PowerOfTwoChoicesStrategy.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PowerOfTwoChoicesStrategy } from '../strategies/PowerOfTwoChoicesStrategy';
import { createBackend, createPoolEntry, BackendPoolEntry } from '../types/backend';

function make(n: number): BackendPoolEntry[] {
  return Array.from({ length: n }, (_, i) =>
    createPoolEntry(createBackend(`b${i}`, `10.0.0.${i}`, 8080))
  );
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('PowerOfTwoChoicesStrategy', () => {
  let strat: PowerOfTwoChoicesStrategy;

  beforeEach(() => {
    strat = new PowerOfTwoChoicesStrategy(2, lcg(1));
  });

  it('has correct name', () => {
    expect(strat.name).toBe('power-of-two-choices');
    expect(strat.choices).toBe(2);
  });

  it('clamps choices to minimum of 2', () => {
    expect(new PowerOfTwoChoicesStrategy(1).choices).toBe(2);
  });

  it('always picks the less-loaded of the two samples', () => {
    // Construct a pool where index 0 is always less-loaded.
    const pool = make(5);
    pool[1].activeConnections = 100;
    pool[2].activeConnections = 100;
    pool[3].activeConnections = 100;
    pool[4].activeConnections = 100;
    // Force sampling determinism: any draw including b0 → b0 wins.
    // Draws not containing b0 → one of the 100-conn nodes, tied → smallest id.
    let b0Picks = 0;
    for (let i = 0; i < 100; i++) {
      const sel = strat.select(pool, {})!;
      if (sel.backend.id === 'b0') b0Picks++;
    }
    // Probability a draw avoids b0 is (4/5)*(3/4) = 0.6 → expected b0 ≈ 40%.
    expect(b0Picks).toBeGreaterThan(20);
    expect(b0Picks).toBeLessThan(80);
  });

  it('respects weight normalization', () => {
    const a = createPoolEntry(createBackend('a', '10.0.0.1', 8080, { weight: 10 }));
    const b = createPoolEntry(createBackend('b', '10.0.0.2', 8080, { weight: 1 }));
    a.activeConnections = 50; // 50/10 = 5
    b.activeConnections = 10; // 10/1 = 10
    const pool = [a, b];
    // With only 2 members, both sampled → a always wins.
    for (let i = 0; i < 10; i++) {
      expect(strat.select(pool, {})!.backend.id).toBe('a');
    }
  });

  it('handles single-backend pool', () => {
    const pool = make(1);
    expect(strat.select(pool, {})!.backend.id).toBe('b0');
  });

  it('returns undefined on empty pool', () => {
    expect(strat.select([], {})).toBeUndefined();
  });

  it('max load stays lower than random in a saturation scenario', () => {
    // Empirical sanity check: simulate 5000 unit completions on 10 backends,
    // never completing (worst case growth). P2C should yield lower max skew
    // than pure random on average.
    const pool = make(10);
    for (let i = 0; i < 5000; i++) {
      const sel = strat.select(pool, {})!;
      pool.find((e) => e.backend.id === sel.backend.id)!.activeConnections += 1;
    }
    const counts = pool.map((e) => e.activeConnections);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // Mean = 500. P2C keeps max tight: < 1.4×mean in practice.
    expect(max).toBeLessThan(700);
    expect(min).toBeGreaterThan(300);
  });
});
