/**
 * Service-mesh engine additions: recovery probing, token-bucket retry
 * budgets, locality priority distribution, cert expiry monitoring.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  RecoveryProber,
  EjectionRegistry,
  RetryBudgetPool,
  LocalityPriorityScheduler,
  CertMonitor,
  SpiffeIdentityManager,
  buildSpiffeId,
} from '../../engine';
import { Endpoint } from '../../engine/config-model';

const ep = (address: string, region: string, zone: string, weight = 1): Endpoint => ({
  address,
  port: 80,
  locality: { region, zone },
  weight,
});

describe('RecoveryProber', () => {
  let clock: ManualClock;
  let prober: RecoveryProber;

  beforeEach(() => {
    clock = new ManualClock(0);
    prober = new RecoveryProber(1000, clock, { probeSuccesses: 2, probeConcurrency: 1 });
  });

  it('ejected host is blocked until expiry, then enters probing', () => {
    prober.notifyEjected('h1', clock.nowMs() + 1000);
    expect(prober.allows('h1')).toBe(false);
    clock.advance(1001);
    expect(prober.stateOf('h1')).toBe('probing');
    expect(prober.allows('h1')).toBe(true);
  });

  it('probe successes promote back to healthy', () => {
    prober.notifyEjected('h1', 1000);
    clock.advance(1001);
    expect(prober.acquireProbe('h1')).toBe(true);
    prober.recordProbeResult('h1', 'success');
    expect(prober.stateOf('h1')).toBe('probing'); // needs 2
    expect(prober.acquireProbe('h1')).toBe(true);
    prober.recordProbeResult('h1', 'success');
    expect(prober.stateOf('h1')).toBe('healthy');
  });

  it('failed probe re-ejects with escalated backoff', () => {
    prober.notifyEjected('h1', 1000);
    clock.advance(1001);
    prober.acquireProbe('h1');
    prober.recordProbeResult('h1', 'error-5xx');
    expect(prober.stateOf('h1')).toBe('ejected');
    expect(prober.allows('h1')).toBe(false);
    // Backoff = 1000 * 1.5 * 1 = 1500 — still blocked at +1000
    clock.advance(1000);
    expect(prober.allows('h1')).toBe(false);
    clock.advance(600);
    expect(prober.stateOf('h1')).toBe('probing');
  });

  it('probe concurrency caps simultaneous probes', () => {
    prober.notifyEjected('h1', 1000);
    clock.advance(1001);
    expect(prober.acquireProbe('h1')).toBe(true);  // 1 inflight
    expect(prober.acquireProbe('h1')).toBe(false); // capped
  });
});

describe('EjectionRegistry', () => {
  it('reports ejected fraction and panic mode', () => {
    const clock = new ManualClock(0);
    const prober = new RecoveryProber(1000, clock);
    const reg = new EjectionRegistry(prober);
    for (const k of ['a', 'b', 'c', 'd']) reg.addMember(k);
    prober.notifyEjected('a', 60_000);
    prober.notifyEjected('b', 60_000);
    prober.notifyEjected('c', 60_000);
    expect(reg.ejectedFraction()).toBe(0.75);
    expect(reg.panicMode(0.5)).toBe(true);
    expect(reg.servable()).toEqual(['d']);
  });
});

describe('RetryBudgetPool', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = new ManualClock(0);
  });

  it('grants retries while tokens last, then refuses', () => {
    const pool = new RetryBudgetPool({ capacity: 5, refillPerSecond: 1 }, clock);
    for (let i = 0; i < 5; i++) {
      expect(pool.tryAcquireRetry('r')).toBe(true);
    }
    expect(pool.tryAcquireRetry('r')).toBe(false);
    expect(pool.stats('r').denied).toBe(1);
  });

  it('refills tokens at the configured rate', () => {
    const pool = new RetryBudgetPool({ capacity: 10, refillPerSecond: 2 }, clock);
    for (let i = 0; i < 10; i++) pool.tryAcquireRetry('r');
    expect(pool.canRetry('r')).toBe(false);
    clock.advance(3000); // +6 tokens
    expect(pool.tryAcquireRetry('r')).toBe(true);
    expect(pool.stats('r').tokens).toBeCloseTo(5, 0);
  });

  it('caps refill at capacity (no unbounded accumulation)', () => {
    const pool = new RetryBudgetPool({ capacity: 5, refillPerSecond: 100 }, clock);
    for (let i = 0; i < 5; i++) pool.tryAcquireRetry('r');
    clock.advance(60_000); // huge dt
    expect(pool.stats('r').tokens).toBe(5);
  });

  it('tracks buckets per route independently', () => {
    const pool = new RetryBudgetPool({ capacity: 1 }, clock);
    expect(pool.tryAcquireRetry('route-a')).toBe(true);
    expect(pool.tryAcquireRetry('route-a')).toBe(false);
    expect(pool.tryAcquireRetry('route-b')).toBe(true);
  });
});

describe('LocalityPriorityScheduler', () => {
  const endpoints = [
    ep('10.0.1.1', 'eu', 'z1'),   // P0 same zone
    ep('10.0.1.2', 'eu', 'z1'),   // P0
    ep('10.0.2.1', 'eu', 'z2'),   // P1 same region
    ep('10.1.0.1', 'us', 'z9'),   // P2 anywhere
  ];

  it('strict local mode (zonePercent=1) always picks same-zone', () => {
    const s = new LocalityPriorityScheduler({ region: 'eu', zone: 'z1' }, { zonePercent: 1 });
    for (let i = 0; i < 20; i++) {
      const e = s.pick(endpoints, `k${i}`)!;
      expect(e.locality!.zone).toBe('z1');
    }
  });

  it('85/15 distribution spills ~15% to region tier', () => {
    const s = new LocalityPriorityScheduler(
      { region: 'eu', zone: 'z1' },
      { zonePercent: 0.85, regionPercent: 0.15 }
    );
    const d = s.distribution(endpoints, 3000);
    const zone = (d['10.0.1.1:80'] ?? 0) + (d['10.0.1.2:80'] ?? 0);
    const region = d['10.0.2.1:80'] ?? 0;
    expect(zone / 3000).toBeGreaterThan(0.75);
    expect(zone / 3000).toBeLessThan(0.93);
    expect(region / 3000).toBeGreaterThan(0.07);
    expect(region / 3000).toBeLessThan(0.25);
    expect(d['10.1.0.1:80'] ?? 0).toBe(0); // P2 gets nothing (0 share configured)
  });

  it('empty zone tier redistributes its share to populated tiers', () => {
    const remote = [
      ep('10.0.2.1', 'eu', 'z2'),  // P1
      ep('10.1.0.1', 'us', 'z9'),  // P2
    ];
    const s = new LocalityPriorityScheduler(
      { region: 'eu', zone: 'z1' },
      { zonePercent: 0.9, regionPercent: 0.1 }
    );
    // No P0 endpoints → all traffic lands on P1/P2.
    const d = s.distribution(remote, 2000);
    expect(d['10.0.2.1:80']).toBeGreaterThan(0);
  });

  it('deterministic per routing key (sticky spillover)', () => {
    const s = new LocalityPriorityScheduler(
      { region: 'eu', zone: 'z1' },
      { zonePercent: 0.5, regionPercent: 0.5 }
    );
    const a = s.pick(endpoints, 'user-7')!;
    expect(s.pick(endpoints, 'user-7')!.address).toBe(a.address);
  });

  it('skips hosts the prober refuses', () => {
    const clock = new ManualClock(0);
    const prober = new RecoveryProber(1000, clock);
    prober.notifyEjected('10.0.1.1:80', 60_000);
    prober.notifyEjected('10.0.1.2:80', 60_000);
    const s = new LocalityPriorityScheduler({ region: 'eu', zone: 'z1' }, { zonePercent: 1 }, prober);
    const e = s.pick(endpoints, 'k');
    // Both z1 hosts ejected → falls through to the region tier.
    expect(e!.locality!.zone).toBe('z2');
    expect(e!.address).toBe('10.0.2.1');
  });
});

describe('CertMonitor', () => {
  let clock: ManualClock;
  let mgr: SpiffeIdentityManager;
  let monitor: CertMonitor;

  beforeEach(() => {
    clock = new ManualClock(0);
    mgr = new SpiffeIdentityManager('corp.internal', clock, { certTtlMs: 3600_000, rotateBeforeMs: 600_000 });
    monitor = new CertMonitor(mgr, clock, { warnBeforeMs: 1800_000, rotateBeforeMs: 600_000 });
  });

  it('classifies certs by remaining life', () => {
    const cert = mgr.issue('prod', 'api');
    expect(monitor.classify(cert)).toBe('ok');
    clock.advance(2000_000); // remaining 1600s > 600s rot, < 1800s warn
    expect(monitor.classify(cert)).toBe('warning');
    clock.advance(1100_000); // remaining 500s < 600s
    expect(monitor.classify(cert)).toBe('rotate-due');
    clock.advance(600_000);  // expired
    expect(monitor.classify(cert)).toBe('expired');
  });

  it('fires rotate hook once per serial inside the rotation window', () => {
    const cert = mgr.issue('prod', 'api');
    const rotated: string[] = [];
    monitor.onRotate((id) => rotated.push(id));
    clock.advance(3100_000); // remaining 500s → rotate-due
    monitor.scan([cert]);
    monitor.scan([cert]); // second scan: no duplicate
    expect(rotated).toEqual([cert.spiffeId]);
  });

  it('fires warning hook before rotation window', () => {
    const cert = mgr.issue('prod', 'api');
    const warned: string[] = [];
    monitor.onWarning((s) => warned.push(s.spiffeId));
    clock.advance(1900_000); // remaining 1700s → warning zone
    monitor.scan([cert]);
    expect(warned).toEqual([cert.spiffeId]);
  });

  it('scanAndRotate re-issues certs nearing expiry', () => {
    const cert = mgr.issue('prod', 'api');
    const oldSerial = cert.serial;
    clock.advance(3100_000);
    const rotated = monitor.scanAndRotate([cert]);
    expect(rotated).toHaveLength(1);
    expect(rotated[0].serial).not.toBe(oldSerial);
    expect(mgr.validate(rotated[0]).ok).toBe(true);
  });

  it('expiryTimeline sorts soonest-first', () => {
    const a = mgr.issue('prod', 'a');
    clock.advance(500_000);
    const b = mgr.issue('prod', 'b'); // issued later → expires later
    const tl = monitor.expiryTimeline([b, a]);
    expect(tl[0].serial).toBe(a.serial);
  });
});
