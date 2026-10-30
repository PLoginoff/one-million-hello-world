/**
 * Tests for TtlDnsDiscovery and HealthDeregistrator.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TtlDnsDiscovery, DnsTransport, DnsAnswer, DnsError } from '../TtlDnsDiscovery';
import { HealthDeregistrator } from '../HealthDeregistrator';
import { LocalRegistry } from '../FederatedRegistry';
import { ManualSdClock2 } from '../types';

class StubTransport implements DnsTransport {
  answers = new Map<string, DnsAnswer>();
  calls: string[] = [];
  failFor = new Set<string>();

  async query(name: string): Promise<DnsAnswer> {
    this.calls.push(name);
    if (this.failFor.has(name)) throw new Error(`DNS timeout for ${name}`);
    const a = this.answers.get(name);
    if (!a) return { endpoints: [], ttlSec: 30 };
    return a;
  }
}

describe('TtlDnsDiscovery', () => {
  let clock: ManualSdClock2;
  let transport: StubTransport;
  let dns: TtlDnsDiscovery;

  beforeEach(() => {
    clock = new ManualSdClock2(0);
    transport = new StubTransport();
    dns = new TtlDnsDiscovery(transport, {
      maxTtlSec: 120,
      negativeTtlSec: 10,
      staleIfErrorSec: 60,
      clock,
    });
    transport.answers.set('payments', {
      endpoints: [
        { host: '10.0.0.1', port: 8080 },
        { host: '10.0.0.2', port: 8080, weight: 3 },
      ],
      ttlSec: 60,
    });
    transport.answers.set('nonexistent', { endpoints: [], ttlSec: 5 });
  });

  it('resolves endpoints into service instances', async () => {
    const out = await dns.resolve('payments');
    expect(out.length).toBe(2);
    expect(out[0].host).toBe('10.0.0.1');
    expect(out[1].weight).toBe(3);
    expect(out[0].clusterId).toBe('dns');
  });

  it('caches answers for the record TTL', async () => {
    await dns.resolve('payments');
    await dns.resolve('payments');
    expect(transport.calls.length).toBe(1);
    clock.advance(59_999);
    await dns.resolve('payments');
    expect(transport.calls.length).toBe(1); // still fresh
    clock.advance(2);
    await dns.resolve('payments');
    expect(transport.calls.length).toBe(2); // expired → refetch
  });

  it('caps TTL at maxTtlSec', async () => {
    transport.answers.set('huge-ttl', { endpoints: [{ host: 'h', port: 1 }], ttlSec: 10_000 });
    await dns.resolve('huge-ttl');
    clock.advance(120_001);
    await dns.resolve('huge-ttl');
    expect(transport.calls.length).toBe(2);
  });

  it('negative-caches empty answers', async () => {
    const out = await dns.resolve('nonexistent');
    expect(out).toEqual([]);
    await dns.resolve('nonexistent');
    expect(transport.calls.filter((c) => c === 'nonexistent').length).toBe(1);
    clock.advance(5_001); // record ttlSec (5) elapsed
    await dns.resolve('nonexistent');
    expect(transport.calls.filter((c) => c === 'nonexistent').length).toBe(2);
  });

  it('serves stale answers when refresh fails within grace', async () => {
    await dns.resolve('payments');
    clock.advance(61_000); // fresh window (60s) elapsed, stale window (60s) open
    transport.failFor.add('payments');
    const out = await dns.resolve('payments');
    expect(out.length).toBe(2); // stale served
    expect(transport.calls.length).toBe(2);
  });

  it('throws past the stale window', async () => {
    await dns.resolve('payments');
    clock.advance(121_000); // fresh 60s + stale 60s elapsed
    transport.failFor.add('payments');
    await expect(dns.resolve('payments')).rejects.toBeInstanceOf(DnsError);
  });

  it('dedupes concurrent refreshes (single-flight)', async () => {
    let resolveFn!: (v: DnsAnswer) => void;
    const slowTransport: DnsTransport = {
      query: () =>
        new Promise((r) => {
          resolveFn = r;
        }),
    };
    const slow = new TtlDnsDiscovery(slowTransport, { clock });
    const p1 = slow.resolve('x');
    const p2 = slow.resolve('x');
    resolveFn({ endpoints: [{ host: 'h', port: 1 }], ttlSec: 60 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b); // same result object, one underlying query
  });

  it('sweep drops fully-expired entries', async () => {
    await dns.resolve('payments');
    clock.advance(200_000);
    expect(dns.sweep()).toBe(1);
    expect(dns.cacheSize).toBe(0);
  });
});

describe('HealthDeregistrator', () => {
  let clock: ManualSdClock2;
  let registry: LocalRegistry;
  let hd: HealthDeregistrator;

  beforeEach(() => {
    clock = new ManualSdClock2(0);
    registry = new LocalRegistry('c1');
    hd = new HealthDeregistrator(registry, {
      intervalMs: 1_000,
      suspectAfter: 1,
      deregisterAfter: 3,
      clock,
    });
    registry.register({
      instanceId: 'i1',
      serviceName: 'svc',
      host: 'h',
      port: 80,
      weight: 1,
      metadata: {},
    });
    hd.track('i1');
  });

  it('healthy → suspect → unhealthy ladder', () => {
    expect(hd.healthOf('i1')!.health).toBe('healthy');
    clock.advance(2_000); // 2 missed
    expect(hd.healthOf('i1')!.health).toBe('suspect');
    clock.advance(2_000); // 4 missed
    expect(hd.healthOf('i1')!.health).toBe('unhealthy');
  });

  it('heartbeat resets the ladder', () => {
    clock.advance(2_000);
    expect(hd.healthOf('i1')!.health).toBe('suspect');
    hd.heartbeat('i1');
    expect(hd.healthOf('i1')!.health).toBe('healthy');
    expect(hd.healthOf('i1')!.missedBeats).toBe(0);
  });

  it('sweep deregisters unhealthy instances', () => {
    clock.advance(3_500); // 3 missed = not yet (>3 required)
    expect(hd.sweep().length).toBe(0);
    clock.advance(500); // 4 missed
    const changed = hd.sweep();
    expect(changed.length).toBe(1);
    expect(changed[0].instanceId).toBe('i1');
    expect(registry.get('i1')).toBeUndefined();
    // Idempotent — second sweep reports nothing.
    expect(hd.sweep().length).toBe(0);
  });

  it('does not deregister suspect instances', () => {
    clock.advance(2_000);
    hd.sweep();
    expect(registry.get('i1')).toBeDefined();
  });

  it('heartbeats on a removed instance do not resurrect it', () => {
    clock.advance(4_500);
    hd.sweep();
    hd.heartbeat('i1');
    expect(registry.get('i1')).toBeUndefined();
  });
});
