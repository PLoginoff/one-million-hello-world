/**
 * Control-plane config generation tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import { MeshConfigError, MeshControlPlane } from '../../engine';

function ep(addr: string, port = 8080, region = 'us-east', zone = 'a') {
  return { address: addr, port, locality: { region, zone } };
}

describe('MeshControlPlane', () => {
  let cp: MeshControlPlane;
  let clock: ManualClock;

  beforeEach(() => {
    clock = new ManualClock(1_000_000);
    cp = new MeshControlPlane({ trustDomain: 'example.mesh' }, clock);
    cp.registerService({
      name: 'payments',
      port: 80,
      protocol: 'http',
      versions: new Map([
        ['v1', [ep('10.0.1.1'), ep('10.0.1.2')]],
        ['v2', [ep('10.0.2.1')]],
      ]),
      trafficSplit: { v1: 90, v2: 10 },
      retryPolicy: { attempts: 3, perTryTimeoutMs: 500, retryOn: ['5xx', 'reset'], budgetPercent: 0.2 },
      outlierDetection: {
        consecutive5xx: 3, baseEjectionMs: 30_000, maxEjectionMs: 300_000,
        maxEjectionPercent: 50, intervalMs: 10_000,
      },
    });
  });

  it('generates listeners and clusters for upstreams', () => {
    const cfg = cp.generateProxyConfig({
      nodeId: 'frontend',
      namespace: 'prod',
      serviceAccount: 'frontend',
      upstreams: ['payments'],
      inboundPort: 8080,
    });
    // inbound + outbound listener
    expect(cfg.listeners.length).toBe(2);
    const outbound = cfg.listeners.find((l) => l.name.startsWith('outbound'));
    expect(outbound).toBeDefined();
    const route = outbound!.routes[0];
    expect(route.weightedClusters).toBeDefined();
    expect(route.weightedClusters!.length).toBe(2);
    const weights = Object.fromEntries(route.weightedClusters!.map((c) => [c.name, c.weight]));
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(route.retryPolicy?.attempts).toBe(3);

    // Two version clusters generated.
    const cls = cfg.clusters.filter((c) => c.service === 'payments');
    expect(cls.length).toBe(2);
    expect(cls.map((c) => c.version).sort()).toEqual(['v1', 'v2']);
  });

  it('rejects traffic splits that do not sum to 100', () => {
    expect(() =>
      cp.registerService({
        name: 'bad', port: 1, protocol: 'http',
        versions: new Map([['v1', [ep('1.1.1.1')]]]),
        trafficSplit: { v1: 50 },
      })
    ).toThrow(MeshConfigError);
  });

  it('rejects splits referencing unknown versions', () => {
    expect(() => cp.setTrafficSplit('payments', { v1: 50, v9: 50 })).toThrow(MeshConfigError);
  });

  it('issues a SPIFFE identity with the proxy config', () => {
    const cfg = cp.generateProxyConfig({
      nodeId: 'frontend', namespace: 'prod', serviceAccount: 'web',
      upstreams: [], inboundPort: 8080,
    });
    expect(cfg.identity?.spiffeId).toBe('spiffe://example.mesh/ns/prod/sa/web');
    expect(cfg.identity?.certExpiresMs).toBeGreaterThan(clock.nowMs());
  });

  it('bumps config version on each generation', () => {
    const a = cp.generateProxyConfig({ nodeId: 'a', namespace: 'n', serviceAccount: 's', upstreams: [], inboundPort: 1 });
    const b = cp.generateProxyConfig({ nodeId: 'b', namespace: 'n', serviceAccount: 's', upstreams: [], inboundPort: 1 });
    expect(b.version).toBe(a.version + 1);
  });

  it('uses locality-aware lb when endpoints have localities', () => {
    const cfg = cp.generateProxyConfig({
      nodeId: 'f', namespace: 'n', serviceAccount: 's', upstreams: ['payments'], inboundPort: 1,
    });
    const cls = cfg.clusters.find((c) => c.service === 'payments' && c.version === 'v1');
    expect(cls?.lbPolicy).toBe('locality-aware');
  });
});
