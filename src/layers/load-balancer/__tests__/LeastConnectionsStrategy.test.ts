/**
 * Tests for LeastConnectionsStrategy.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LeastConnectionsStrategy } from '../strategies/LeastConnectionsStrategy';
import { createBackend, createPoolEntry } from '../types/backend';

function entry(id: string, conns: number, weight = 1, ewma = 0) {
  const e = createPoolEntry(createBackend(id, '10.0.0.1', 8080, { weight }));
  e.activeConnections = conns;
  e.ewmaResponseTimeMs = ewma;
  return e;
}

describe('LeastConnectionsStrategy', () => {
  let strat: LeastConnectionsStrategy;

  beforeEach(() => {
    strat = new LeastConnectionsStrategy();
  });

  it('has correct name', () => {
    expect(strat.name).toBe('least-connections');
  });

  it('picks the backend with fewest connections', () => {
    const pool = [entry('a', 10), entry('b', 3), entry('c', 7)];
    expect(strat.select(pool, {})!.backend.id).toBe('b');
  });

  it('normalizes by weight (weighted-least-connections)', () => {
    // a: 10 conns, w=5 → score 2 ; b: 3 conns, w=1 → score 3
    const pool = [entry('a', 10, 5), entry('b', 3, 1)];
    expect(strat.select(pool, {})!.backend.id).toBe('a');
  });

  it('tie-breaks on lower EWMA latency', () => {
    const a = entry('a', 5, 1, 100);
    const b = entry('b', 5, 1, 20);
    expect(strat.select([a, b], {})!.backend.id).toBe('b');
  });

  it('prefers idle (zero-connection) backend and short-circuits', () => {
    const pool = [entry('a', 50), entry('b', 0), entry('c', 1)];
    expect(strat.select(pool, {})!.backend.id).toBe('b');
  });

  it('returns undefined on empty pool', () => {
    expect(strat.select([], {})).toBeUndefined();
  });
});
