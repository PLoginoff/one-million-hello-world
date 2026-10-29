/**
 * Tests for RandomStrategy and IPHashStrategy.
 */

import { describe, it, expect } from 'bun:test';
import { RandomStrategy } from '../strategies/RandomStrategy';
import { IPHashStrategy, djb2 } from '../strategies/IPHashStrategy';
import { createBackend, createPoolEntry } from '../types/backend';

function entries(n: number) {
  return Array.from({ length: n }, (_, i) =>
    createPoolEntry(createBackend(`b${i}`, `10.0.0.${i}`, 8080))
  );
}

/** Deterministic LCG for tests (numerical recipes constants). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('RandomStrategy', () => {
  it('has correct name', () => {
    expect(new RandomStrategy().name).toBe('random');
  });

  it('selects uniformly over many draws', () => {
    const strat = new RandomStrategy(lcg(42));
    const pool = entries(4);
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const sel = strat.select(pool, {})!;
      counts.set(sel.backend.id, (counts.get(sel.backend.id) ?? 0) + 1);
    }
    for (const e of pool) {
      const share = counts.get(e.backend.id)! / 4000;
      expect(share).toBeGreaterThan(0.18); // expect ~0.25, allow slack
      expect(share).toBeLessThan(0.32);
    }
  });

  it('weighted mode skews toward heavy backends', () => {
    const strat = new RandomStrategy(lcg(7), true);
    const pool = [
      createPoolEntry(createBackend('heavy', '10.0.0.1', 8080, { weight: 9 })),
      createPoolEntry(createBackend('light', '10.0.0.2', 8080, { weight: 1 })),
    ];
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const sel = strat.select(pool, {})!;
      counts.set(sel.backend.id, (counts.get(sel.backend.id) ?? 0) + 1);
    }
    expect(counts.get('heavy')!).toBeGreaterThan(1600); // ~90%
  });

  it('returns undefined on empty pool', () => {
    expect(new RandomStrategy().select([], {})).toBeUndefined();
  });
});

describe('djb2', () => {
  it('is deterministic and unsigned', () => {
    const h = djb2('1.2.3.4');
    expect(h).toBe(djb2('1.2.3.4'));
    expect(h).toBeGreaterThanOrEqual(0);
  });
});

describe('IPHashStrategy', () => {
  it('has correct name', () => {
    expect(new IPHashStrategy().name).toBe('ip-hash');
  });

  it('same client IP always lands on same backend', () => {
    const strat = new IPHashStrategy();
    const pool = entries(5);
    const picks = Array.from({ length: 10 }, () =>
      strat.select(pool, { clientIp: '203.0.113.7' })!.backend.id
    );
    expect(new Set(picks).size).toBe(1);
  });

  it('different IPs spread across backends', () => {
    const strat = new IPHashStrategy();
    const pool = entries(4);
    const picks = new Set<string>();
    for (let i = 0; i < 100; i++) {
      picks.add(strat.select(pool, { clientIp: `192.168.1.${i}` })!.backend.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('deterministically fails over when home backend unhealthy', () => {
    const strat = new IPHashStrategy();
    const pool = entries(4);
    const ip = '198.51.100.42';
    const home = strat.select(pool, { clientIp: ip })!.backend.id;
    pool.find((e) => e.backend.id === home)!.status = 'unhealthy';
    const failover1 = strat.select(pool, { clientIp: ip })!;
    const failover2 = strat.select(pool, { clientIp: ip })!;
    expect(failover1.backend.id).not.toBe(home);
    expect(failover1.backend.id).toBe(failover2.backend.id);
    expect(strat.failoverCount).toBe(2);
  });

  it('falls back when no clientIp', () => {
    const strat = new IPHashStrategy();
    const pool = entries(3);
    const sel = strat.select(pool, {})!;
    expect(sel.diagnostics?.reason).toBe('missing-client-ip');
  });

  it('returns undefined on empty pool', () => {
    expect(new IPHashStrategy().select([], { clientIp: '1.2.3.4' })).toBeUndefined();
  });
});
