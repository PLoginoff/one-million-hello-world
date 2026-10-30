/**
 * Tests for FederatedRegistry, MeshSync, DiscoveryMetrics, DiscoveryFacade.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LocalRegistry, FederatedRegistry } from '../FederatedRegistry';
import { MeshSync, InMemoryMeshTransport } from '../MeshSync';
import { DiscoveryMetrics } from '../DiscoveryMetrics';
import { DiscoveryFacade } from '../DiscoveryFacade';
import { TtlDnsDiscovery, DnsTransport } from '../TtlDnsDiscovery';
import { ManualSdClock2, ServiceInstance2 } from '../types';

const inst = (id: string, svc = 'svc', host = 'h'): Omit<ServiceInstance2, 'registeredAtMs' | 'clusterId'> => ({
  instanceId: id,
  serviceName: svc,
  host,
  port: 8080,
  weight: 1,
  metadata: {},
});

describe('LocalRegistry', () => {
  it('registers, lists, and deregisters instances', () => {
    const r = new LocalRegistry('c1');
    r.register(inst('i1'));
    r.register(inst('i2'));
    r.register(inst('i3', 'other'));
    expect(r.list('svc').length).toBe(2);
    expect(r.serviceNames().sort()).toEqual(['other', 'svc']);
    expect(r.deregister('i1')).toBe(true);
    expect(r.list('svc').map((i) => i.instanceId)).toEqual(['i2']);
    expect(r.deregister('nope')).toBe(false);
  });
});

describe('FederatedRegistry', () => {
  let clock: ManualSdClock2;
  let fed: FederatedRegistry;

  beforeEach(() => {
    clock = new ManualSdClock2(1_000);
    fed = new FederatedRegistry({ clock });
    fed.attach(new LocalRegistry('east'));
    fed.attach(new LocalRegistry('west'));
    fed.registerIn('east', inst('e1'));
    fed.registerIn('east', inst('e2'));
    fed.registerIn('west', inst('w1'));
  });

  it('merges instances across clusters', () => {
    const out = fed.lookup('svc');
    expect(out.map((i) => i.instanceId).sort()).toEqual(['e1', 'e2', 'w1']);
  });

  it('prefers the local cluster', () => {
    const out = fed.lookup('svc', { preferClusterId: 'west' });
    expect(out[0].clusterId).toBe('west');
    expect(out.slice(1).every((i) => i.clusterId === 'east')).toBe(true);
  });

  it('dedupes shared instanceIds preferring first cluster', () => {
    fed.registerIn('west', inst('e1')); // same id re-registered in west
    const out = fed.lookup('svc');
    const e1s = out.filter((i) => i.instanceId === 'e1');
    expect(e1s.length).toBe(1);
  });

  it('caps results at maxInstances', () => {
    const out = fed.lookup('svc', { maxInstances: 2 });
    expect(out.length).toBe(2);
  });

  it('deregister finds the owning cluster', () => {
    expect(fed.deregister('w1')).toBe('west');
    expect(fed.deregister('w1')).toBeNull();
  });

  it('stamps registeredAtMs from the clock', () => {
    const i = fed.registerIn('east', inst('e9'));
    expect(i.registeredAtMs).toBe(1_000);
    expect(i.clusterId).toBe('east');
  });
});

describe('MeshSync', () => {
  let clock: ManualSdClock2;
  let transport: InMemoryMeshTransport;
  let mesh: MeshSync;
  const mk = (id: string): ServiceInstance2 => ({
    instanceId: id,
    serviceName: 'svc',
    host: `h-${id}`,
    port: 80,
    weight: 1,
    clusterId: 'c1',
    metadata: {},
    registeredAtMs: 0,
  });

  beforeEach(() => {
    clock = new ManualSdClock2(0);
    transport = new InMemoryMeshTransport();
    mesh = new MeshSync(transport, { staleAfterVersions: 2, clock });
    mesh.attachSidecar('sc1');
  });

  it('pushes deltas and applies them on ack', async () => {
    mesh.setDesired([mk('a'), mk('b')]); // v1
    expect(await mesh.push('sc1')).toBe(true);
    const update = transport.delivered.get('sc1')![0];
    expect(update.version).toBe(1);
    expect(update.endpoints.length).toBe(2);
    expect(mesh.ack('sc1', 1)).toBe(true);
    expect(mesh.status('sc1')!.state).toBe('in-sync');

    mesh.setDesired([mk('a'), mk('c')]); // v2: remove b, add c
    await mesh.push('sc1');
    const delta = transport.delivered.get('sc1')![1];
    const tombstones = delta.endpoints.filter((e) => e.metadata['tombstone'] === '1');
    expect(tombstones.map((t) => t.instanceId)).toEqual(['b']);
    expect(delta.endpoints.some((e) => e.instanceId === 'c')).toBe(true);
    mesh.ack('sc1', 2);
  });

  it('nack keeps the last-acked shadow', async () => {
    mesh.setDesired([mk('a')]);
    await mesh.push('sc1');
    mesh.ack('sc1', 1);
    mesh.setDesired([mk('x'), mk('y')]);
    await mesh.push('sc1');
    mesh.nack('sc1');
    // Next push must resend the same delta — shadow unchanged.
    mesh.setDesired([mk('x'), mk('y'), mk('z')]);
    await mesh.push('sc1');
    const last = transport.delivered.get('sc1')!.at(-1)!;
    // Delta vs v1 shadow {a}: add x,y,z + tombstone for a = 4 entries.
    expect(last.endpoints.length).toBe(4);
    expect(last.endpoints.filter((e) => e.metadata['tombstone'] === '1').map((e) => e.instanceId)).toEqual(['a']);
  });

  it('falls back to full-state resync when stale', async () => {
    mesh.setDesired([mk('a')]);
    await mesh.push('sc1');
    mesh.ack('sc1', 1);
    // Bump version 3 more times without acking (lag 3 > staleAfter 2)
    mesh.setDesired([mk('a'), mk('b')]);
    mesh.setDesired([mk('a'), mk('b'), mk('c')]);
    mesh.setDesired([mk('z')]); // v4
    expect(mesh.status('sc1')!.state).toBe('stale');
    await mesh.push('sc1');
    const update = transport.delivered.get('sc1')!.at(-1)!;
    // Full state, not delta: exactly the desired table.
    expect(update.endpoints.map((e) => e.instanceId)).toEqual(['z']);
    mesh.ack('sc1', 4);
    expect(mesh.status('sc1')!.state).toBe('in-sync');
  });

  it('counts delivery failures', async () => {
    transport.partitioned.add('sc1');
    mesh.setDesired([mk('a')]);
    expect(await mesh.push('sc1')).toBe(false);
    expect(mesh.pushFailures).toBe(1);
    expect(mesh.status('sc1')!.pendingVersion).toBeNull();
  });
});

describe('DiscoveryMetrics + DiscoveryFacade', () => {
  it('records latency, hit rate, and sources', async () => {
    const clock = new ManualSdClock2(0);
    const m = new DiscoveryMetrics({ clock });
    m.record({ instances: [], source: 'east', cached: false, latencyMs: 3 });
    m.record({ instances: [inst('x') as ServiceInstance2], source: 'dns', cached: true, latencyMs: 1 });
    m.recordError('dns', 10);
    const s = m.stats();
    expect(s.lookups).toBe(3);
    expect(s.hitRate).toBeCloseTo(1 / 3);
    expect(s.errors).toBe(1);
    expect(s.empty).toBe(1);
    expect(s.bySource['dns']).toBe(2);
    expect(s.latency.p50Ms).toBe(3);
    expect(s.latency.maxMs).toBe(10);
  });

  it('facade prefers federation, falls back to DNS', async () => {
    const clock = new ManualSdClock2(0);
    const transport: DnsTransport = {
      query: async (name) => ({
        endpoints: name === 'legacy' ? [{ host: 'dns-h', port: 9 }] : [],
        ttlSec: 60,
      }),
    };
    const facade = new DiscoveryFacade('east', {
      dns: new TtlDnsDiscovery(transport, { clock }),
      clock,
    });
    facade.registerLocal(inst('l1', 'svc'));

    const r1 = await facade.lookup('svc');
    expect(r1.source).toBe('east');
    expect(r1.instances[0].instanceId).toBe('l1');

    const r2 = await facade.lookup('legacy');
    expect(r2.source).toBe('dns');
    expect(r2.cached).toBe(false);
    expect(r2.instances[0].host).toBe('dns-h');

    const r3 = await facade.lookup('legacy');
    expect(r3.cached).toBe(true); // second lookup hits DNS cache

    const s = facade.metrics.stats();
    expect(s.lookups).toBe(3);
    expect(s.hits).toBe(1);
  });

  it('facade sweeps silent instances out of the registry', async () => {
    const clock = new ManualSdClock2(0);
    const facade = new DiscoveryFacade('east', {
      clock,
      healthOpts: { intervalMs: 100, suspectAfter: 1, deregisterAfter: 2 },
    });
    facade.registerLocal(inst('l1', 'svc'));
    clock.advance(400); // 4 missed beats
    const changed = facade.sweepHealth();
    expect(changed.length).toBe(1);
    const r = await facade.lookup('svc');
    expect(r.instances.length).toBe(0);
  });
});
