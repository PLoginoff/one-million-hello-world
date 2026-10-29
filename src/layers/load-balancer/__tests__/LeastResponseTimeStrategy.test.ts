/**
 * Tests for LeastResponseTimeStrategy.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LeastResponseTimeStrategy } from '../strategies/LeastResponseTimeStrategy';
import { createBackend, createPoolEntry } from '../types/backend';

function entry(id: string, conns: number, ewma: number) {
  const e = createPoolEntry(createBackend(id, '10.0.0.1', 8080));
  e.activeConnections = conns;
  e.ewmaResponseTimeMs = ewma;
  return e;
}

describe('LeastResponseTimeStrategy', () => {
  let strat: LeastResponseTimeStrategy;

  beforeEach(() => {
    strat = new LeastResponseTimeStrategy(1);
  });

  it('has correct name', () => {
    expect(strat.name).toBe('least-response-time');
  });

  it('prefers backend with lowest (conns+1)*latency score', () => {
    // a: 2 conns * 50ms  = 150 ; b: 5 conns * 10ms = 60
    const pool = [entry('a', 2, 50), entry('b', 5, 10)];
    expect(strat.select(pool, {})!.backend.id).toBe('b');
  });

  it('cold backend (no samples) gets probing bias', () => {
    const hot = entry('a', 0, 500); // known slow
    const cold = entry('b', 0, 0); // no samples → floor = 1ms → score 1
    const sel = strat.select([hot, cold], {})!;
    expect(sel.backend.id).toBe('b');
  });

  it('loaded backend loses to unloaded slower one', () => {
    const loaded = entry('a', 100, 10); // score 101*10 = 1010
    const idle = entry('b', 0, 100); // score 1*100 = 100
    expect(strat.select([loaded, idle], {})!.backend.id).toBe('b');
  });

  it('score() exposes the composite function', () => {
    const e = entry('a', 4, 25);
    expect(strat.score(e)).toBeCloseTo((4 + 1) * 25, 5);
  });

  it('returns undefined on empty pool', () => {
    expect(strat.select([], {})).toBeUndefined();
  });
});
