/**
 * Tests for RoundRobinStrategy.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RoundRobinStrategy } from '../strategies/RoundRobinStrategy';
import { createBackend, createPoolEntry } from '../types/backend';

function entries(n: number) {
  return Array.from({ length: n }, (_, i) =>
    createPoolEntry(createBackend(`b${i}`, `10.0.0.${i}`, 8080))
  );
}

describe('RoundRobinStrategy', () => {
  let strat: RoundRobinStrategy;

  beforeEach(() => {
    strat = new RoundRobinStrategy();
  });

  it('has correct name', () => {
    expect(strat.name).toBe('round-robin');
  });

  it('cycles through backends in order', () => {
    const pool = entries(3);
    const picks = [0, 1, 2, 3, 4, 5].map(() => strat.select(pool, {})!.backend.id);
    expect(picks).toEqual(['b0', 'b1', 'b2', 'b0', 'b1', 'b2']);
  });

  it('distributes evenly over full cycles', () => {
    const pool = entries(4);
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const sel = strat.select(pool, {})!;
      counts.set(sel.backend.id, (counts.get(sel.backend.id) ?? 0) + 1);
    }
    for (const e of pool) {
      expect(counts.get(e.backend.id)).toBe(100);
    }
  });

  it('handles pool shrink gracefully', () => {
    const pool = entries(3);
    strat.select(pool, {});
    strat.select(pool, {});
    strat.select(pool, {});
    // Now shrink to 1 backend — cursor modulo handles it.
    const shrunk = [pool[0]];
    for (let i = 0; i < 5; i++) {
      expect(strat.select(shrunk, {})!.backend.id).toBe('b0');
    }
  });

  it('returns undefined for empty pool', () => {
    expect(strat.select([], {})).toBeUndefined();
  });

  it('reset restarts the cycle', () => {
    const pool = entries(3);
    strat.select(pool, {});
    strat.select(pool, {});
    strat.reset();
    expect(strat.select(pool, {})!.backend.id).toBe('b0');
    expect(strat.selectionCount).toBe(1);
  });
});
