/**
 * Tests for BackendPool health tracking and routing lifecycle.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BackendPool } from '../strategies/BackendPool';
import { RoundRobinStrategy } from '../strategies/RoundRobinStrategy';
import { createBackend } from '../types/backend';

function makePool(): BackendPool {
  const pool = new BackendPool({ consecutiveFailureThreshold: 3, unhealthyCooldownMs: 1000 });
  pool.registerStrategy(new RoundRobinStrategy());
  pool.addBackend(createBackend('a', '10.0.0.1', 8080));
  pool.addBackend(createBackend('b', '10.0.0.2', 8080));
  pool.addBackend(createBackend('c', '10.0.0.3', 8080));
  return pool;
}

describe('BackendPool', () => {
  let pool: BackendPool;

  beforeEach(() => {
    pool = makePool();
  });

  it('registers backends and tracks size', () => {
    expect(pool.size).toBe(3);
    expect(pool.entries().map((e) => e.backend.id)).toEqual(['a', 'b', 'c']);
  });

  it('routes via a named strategy and increments connections', () => {
    const sel = pool.route('round-robin', {});
    expect(sel).toBeDefined();
    expect(sel!.backend.id).toBe('a');
    expect(pool.get('a')!.activeConnections).toBe(1);
  });

  it('returns undefined and counts rejections when pool empty', () => {
    const empty = new BackendPool();
    empty.registerStrategy(new RoundRobinStrategy());
    expect(empty.route('round-robin', {})).toBeUndefined();
    expect(empty.stats().emptyPoolRejections).toBe(1);
  });

  it('throws on unknown strategy name', () => {
    expect(() => pool.route('nope', {})).toThrow();
  });

  it('marks backend unhealthy after threshold consecutive failures', () => {
    for (let i = 0; i < 3; i++) {
      pool.complete('a', 10, false);
    }
    expect(pool.get('a')!.status).toBe('unhealthy');
    expect(pool.routable().map((e) => e.backend.id)).toEqual(['b', 'c']);
  });

  it('excludes unhealthy backend from routing', () => {
    for (let i = 0; i < 3; i++) {
      pool.complete('a', 10, false);
    }
    const picks = new Set<string>();
    for (let i = 0; i < 9; i++) {
      picks.add(pool.route('round-robin', {})!.backend.id);
    }
    expect(picks.has('a')).toBe(false);
    expect(picks.has('b')).toBe(true);
    expect(picks.has('c')).toBe(true);
  });

  it('half-opens unhealthy backend after cooldown probe', () => {
    for (let i = 0; i < 3; i++) {
      pool.complete('a', 10, false);
    }
    expect(pool.get('a')!.status).toBe('unhealthy');
    const t0 = pool.get('a')!.lastFailureAt;
    // Too early → still unhealthy
    expect(pool.probe('a', t0 + 500)).toBe('unhealthy');
    // After cooldown → degraded (half-open)
    expect(pool.probe('a', t0 + 1500)).toBe('degraded');
  });

  it('drains a backend on request', () => {
    expect(pool.drain('b')).toBe(true);
    expect(pool.get('b')!.status).toBe('draining');
    expect(pool.routable().map((e) => e.backend.id)).toEqual(['a', 'c']);
  });

  it('recovers backend after successful completions', () => {
    for (let i = 0; i < 3; i++) {
      pool.complete('a', 10, false);
    }
    expect(pool.get('a')!.status).toBe('unhealthy');
    pool.probe('a', pool.get('a')!.lastFailureAt + 2000);
    expect(pool.get('a')!.status).toBe('degraded');
    // Successful trial request resets consecutive failure counter on next completion.
    pool.complete('a', 5, true);
    expect(pool.get('a')!.consecutiveFailures).toBe(0);
  });

  it('tracks EWMA response time', () => {
    pool.complete('a', 100, true);
    expect(pool.get('a')!.ewmaResponseTimeMs).toBe(100);
    pool.complete('a', 200, true);
    // EWMA alpha=0.2 → 0.2*200 + 0.8*100 = 120
    expect(pool.get('a')!.ewmaResponseTimeMs).toBeCloseTo(120, 5);
  });

  it('notifies strategies on add/remove', () => {
    const strat = new RoundRobinStrategy();
    pool.registerStrategy(strat);
    pool.addBackend(createBackend('d', '10.0.0.4', 8080));
    expect(pool.size).toBe(4);
    pool.removeBackend('d');
    expect(pool.size).toBe(3);
    expect(pool.get('d')).toBeUndefined();
  });

  it('snapshot reports per-backend state', () => {
    pool.complete('a', 50, true);
    const snap = pool.snapshot();
    const a = snap.find((s) => s.id === 'a')!;
    expect(a.totalRequests).toBe(1);
    expect(a.ewmaResponseTimeMs).toBe(50);
  });
});
