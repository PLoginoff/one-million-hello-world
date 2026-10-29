/**
 * Tests for DnsResolver (SRV/A stub).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DnsResolver, SrvRecord } from '../strategies/DnsResolver';

function srv(target: string, port: number, priority: number, weight: number, ttl = 30): SrvRecord {
  return { target, port, priority, weight, ttl };
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('DnsResolver', () => {
  let dns: DnsResolver;

  beforeEach(() => {
    dns = new DnsResolver({ rng: lcg(7) });
  });

  it('resolves SRV records', () => {
    dns.setSrv('_api._tcp.local', [srv('a.local', 8080, 1, 100), srv('b.local', 8080, 1, 100)]);
    const out = dns.lookupSrv('_api._tcp.local');
    expect(out.length).toBe(2);
    expect(out[0].target).toBe('a.local');
  });

  it('resolves A records', () => {
    dns.setA('api.local', ['10.0.0.1', '10.0.0.2']);
    expect(dns.lookupA('api.local')).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('returns empty for unknown names', () => {
    expect(dns.lookupSrv('nope')).toEqual([]);
    expect(dns.lookupA('nope')).toEqual([]);
  });

  it('caches SRV lookups until TTL', () => {
    dns.setSrv('_s._tcp.local', [srv('a', 1, 1, 1, 60)]);
    dns.lookupSrv('_s._tcp.local');
    dns.lookupSrv('_s._tcp.local');
    dns.lookupSrv('_s._tcp.local');
    expect(dns.queryCount).toBe(3);
    expect(dns.cacheHits).toBe(2);
  });

  it('setSrv invalidates cache', () => {
    dns.setSrv('_s._tcp.local', [srv('a', 1, 1, 1)]);
    dns.lookupSrv('_s._tcp.local');
    dns.setSrv('_s._tcp.local', [srv('b', 1, 1, 1), srv('c', 1, 1, 1)]);
    const out = dns.lookupSrv('_s._tcp.local');
    expect(out.length).toBe(2);
  });

  it('pickTarget chooses lowest priority first', () => {
    dns.setSrv('_s._tcp.local', [
      srv('p10-a', 80, 10, 100),
      srv('p10-b', 80, 10, 100),
      srv('p20-a', 80, 20, 100),
    ]);
    for (let i = 0; i < 20; i++) {
      const t = dns.pickTarget('_s._tcp.local')!;
      expect(t.priority).toBe(10);
    }
  });

  it('within same priority picks proportionally to weight', () => {
    dns.setSrv('_s._tcp.local', [
      srv('heavy', 80, 1, 90),
      srv('light', 80, 1, 10),
    ]);
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const t = dns.pickTarget('_s._tcp.local')!;
      counts.set(t.target, (counts.get(t.target) ?? 0) + 1);
    }
    expect(counts.get('heavy')!).toBeGreaterThan(700);
  });

  it('zero-weight target is never picked', () => {
    dns.setSrv('_s._tcp.local', [
      srv('on', 80, 1, 100),
      srv('off', 80, 1, 0),
    ]);
    for (let i = 0; i < 50; i++) {
      expect(dns.pickTarget('_s._tcp.local')!.target).toBe('on');
    }
  });
});
