/**
 * Traffic splitting, locality routing, outlier ejection, retry budgets.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  CircuitBreakerSync,
  LocalityRouter,
  OutlierDetector,
  RetryBudget,
  TrafficSplitter,
  buildSpiffeId,
  parseSpiffeId,
  SpiffeIdentityManager,
} from '../../engine';

describe('TrafficSplitter', () => {
  it('is deterministic per routing key', () => {
    const s = new TrafficSplitter([
      { name: 'v1', weight: 90 },
      { name: 'v2', weight: 10 },
    ]);
    const a = s.pick('user-42');
    expect(s.pick('user-42')).toBe(a);
  });

  it('roughly honours weights', () => {
    const s = new TrafficSplitter([
      { name: 'stable', weight: 80 },
      { name: 'canary', weight: 20 },
    ]);
    const d = s.distribution(2_000);
    expect(d['canary'] / 2000).toBeGreaterThan(0.15);
    expect(d['canary'] / 2000).toBeLessThan(0.25);
  });

  it('rejects weights not summing to 100', () => {
    expect(() => new TrafficSplitter([{ name: 'a', weight: 50 }])).toThrow();
  });
});

describe('LocalityRouter', () => {
  const local = { region: 'us-east', zone: 'a' };

  it('prefers same-zone endpoints', () => {
    const r = new LocalityRouter(local);
    const eps = [
      { address: '10.0.0.1', port: 80, locality: { region: 'us-east', zone: 'a' } },
      { address: '10.0.0.2', port: 80, locality: { region: 'us-west', zone: 'z' } },
    ];
    for (let i = 0; i < 10; i++) {
      expect(r.pick(eps)?.address).toBe('10.0.0.1');
    }
  });

  it('falls back to remote endpoints when no local ones exist', () => {
    const r = new LocalityRouter(local);
    const eps = [{ address: '10.9.9.9', port: 80, locality: { region: 'us-west', zone: 'z' } }];
    expect(r.pick(eps)?.address).toBe('10.9.9.9');
  });

  it('round-robins within a locality', () => {
    const r = new LocalityRouter(local);
    const eps = [
      { address: '10.0.0.1', port: 80, locality: { region: 'us-east', zone: 'a' } },
      { address: '10.0.0.2', port: 80, locality: { region: 'us-east', zone: 'a' } },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) seen.add(r.pick(eps)!.address);
    expect(seen.size).toBe(2);
  });

  it('honours endpoint weights', () => {
    const r = new LocalityRouter(local);
    const eps = [
      { address: 'heavy', port: 80, locality: { region: 'us-east', zone: 'a' }, weight: 3 },
      { address: 'light', port: 80, locality: { region: 'us-east', zone: 'a' }, weight: 1 },
    ];
    const counts: Record<string, number> = { heavy: 0, light: 0 };
    for (let i = 0; i < 40; i++) counts[r.pick(eps)!.address]++;
    expect(counts.heavy).toBeGreaterThan(counts.light);
  });

  it('skips ejected endpoints', () => {
    const clock = new ManualClock(0);
    const detector = new OutlierDetector(
      { consecutive5xx: 2, baseEjectionMs: 10_000, maxEjectionMs: 60_000, maxEjectionPercent: 90, intervalMs: 5_000 },
      clock
    );
    const r = new LocalityRouter(local, detector);
    const eps = [
      { address: '10.0.0.1', port: 80, locality: { region: 'us-east', zone: 'a' } },
      { address: '10.0.0.2', port: 80, locality: { region: 'us-east', zone: 'a' } },
    ];
    detector.record('10.0.0.1:80', 'error-5xx');
    detector.record('10.0.0.1:80', 'error-5xx');
    for (let i = 0; i < 6; i++) {
      expect(r.pick(eps)?.address).toBe('10.0.0.2');
    }
  });

  it('returns null when all endpoints are ejected', () => {
    const clock = new ManualClock(0);
    const detector = new OutlierDetector(
      { consecutive5xx: 1, baseEjectionMs: 10_000, maxEjectionMs: 60_000, maxEjectionPercent: 100, intervalMs: 5_000 },
      clock
    );
    const r = new LocalityRouter(local, detector);
    const eps = [{ address: '10.0.0.1', port: 80 }];
    detector.record('10.0.0.1:80', 'error-5xx');
    expect(r.pick(eps)).toBeNull();
  });
});

describe('OutlierDetector', () => {
  let clock: ManualClock;
  let det: OutlierDetector;

  beforeEach(() => {
    clock = new ManualClock(0);
    det = new OutlierDetector(
      { consecutive5xx: 3, baseEjectionMs: 10_000, maxEjectionMs: 60_000, maxEjectionPercent: 50, intervalMs: 5_000 },
      clock
    );
  });

  it('ejects after consecutive 5xx threshold', () => {
    det.record('a:80', 'error-5xx');
    det.record('a:80', 'error-5xx');
    expect(det.isEjected('a:80')).toBe(false);
    det.record('a:80', 'error-5xx');
    expect(det.isEjected('a:80')).toBe(true);
  });

  it('success resets the consecutive counter', () => {
    det.record('a:80', 'error-5xx');
    det.record('a:80', 'error-5xx');
    det.record('a:80', 'success');
    det.record('a:80', 'error-5xx');
    det.record('a:80', 'error-5xx');
    expect(det.isEjected('a:80')).toBe(false);
  });

  it('re-admits after ejection expires', () => {
    for (let i = 0; i < 3; i++) det.record('a:80', 'error-5xx');
    expect(det.isEjected('a:80')).toBe(true);
    clock.advance(10_001);
    expect(det.isEjected('a:80')).toBe(false);
  });

  it('exponential backoff on repeat ejections', () => {
    for (let i = 0; i < 3; i++) det.record('a:80', 'error-5xx');
    const first = det.state('a:80')!.ejectedUntilMs;
    clock.advance(10_001);
    for (let i = 0; i < 3; i++) det.record('a:80', 'error-5xx');
    const second = det.state('a:80')!.ejectedUntilMs;
    expect(second - clock.nowMs()).toBeGreaterThan(first - 10_001 - clock.nowMs() + 10_001);
  });
});

describe('RetryBudget', () => {
  it('caps concurrent retries by ratio', () => {
    const b = new RetryBudget(0.2, 100);
    for (let i = 0; i < 10; i++) b.requestStarted();
    // 20% of 10 = 2 allowed (floor of 3 applies, so actually 3).
    expect(b.retryStarted()).toBe(true);
    expect(b.retryStarted()).toBe(true);
    expect(b.retryStarted()).toBe(true);
    expect(b.retryStarted()).toBe(false);
  });

  it('retryFinished frees capacity', () => {
    const b = new RetryBudget(0.2, 100);
    for (let i = 0; i < 10; i++) b.requestStarted();
    b.retryStarted(); b.retryStarted(); b.retryStarted();
    expect(b.retryStarted()).toBe(false);
    b.retryFinished();
    expect(b.retryStarted()).toBe(true);
  });

  it('respects the absolute cap', () => {
    const b = new RetryBudget(1.0, 2);
    for (let i = 0; i < 10; i++) b.requestStarted();
    expect(b.retryStarted()).toBe(true);
    expect(b.retryStarted()).toBe(true);
    expect(b.retryStarted()).toBe(false);
  });
});

describe('CircuitBreakerSync', () => {
  it('opens on high error rate and half-opens after sleep', () => {
    const clock = new ManualClock(0);
    const cb = new CircuitBreakerSync({ errorThreshold: 0.5, windowMs: 60_000, sleepMs: 1_000 }, clock);
    for (let i = 0; i < 6; i++) cb.record('r', false);
    expect(cb.stateOf('r')).toBe('open');
    clock.advance(1_001);
    cb.record('r', true);
    expect(cb.stateOf('r')).toBe('closed');
  });

  it('reopens from half-open on failure', () => {
    const clock = new ManualClock(0);
    const cb = new CircuitBreakerSync({ errorThreshold: 0.5, windowMs: 60_000, sleepMs: 1_000 }, clock);
    for (let i = 0; i < 6; i++) cb.record('r', false);
    clock.advance(1_001);
    cb.record('r', false);
    expect(cb.stateOf('r')).toBe('open');
  });
});

describe('SPIFFE identity', () => {
  it('builds and parses ids', () => {
    const id = buildSpiffeId('example.mesh', 'prod', 'web');
    expect(parseSpiffeId(id)).toEqual({
      trustDomain: 'example.mesh', namespace: 'prod', serviceAccount: 'web',
    });
  });

  it('rejects malformed ids', () => {
    expect(() => parseSpiffeId('http://wrong')).toThrow();
    expect(() => parseSpiffeId('spiffe://td/ns/x')).toThrow();
  });

  it('issues and validates certs', () => {
    const clock = new ManualClock(0);
    const mgr = new SpiffeIdentityManager('example.mesh', clock, { certTtlMs: 10_000 });
    const cert = mgr.issue('prod', 'web');
    expect(mgr.validate(cert).ok).toBe(true);
    clock.advance(11_000);
    expect(mgr.validate(cert).ok).toBe(false);
  });

  it('rotates near-expiry certs', () => {
    const clock = new ManualClock(0);
    const mgr = new SpiffeIdentityManager('example.mesh', clock, {
      certTtlMs: 10_000, rotateBeforeMs: 2_000,
    });
    const c1 = mgr.issue('prod', 'web');
    expect(mgr.rotate().length).toBe(0); // plenty of life left
    clock.advance(9_000); // 1s left → rotate
    const rotated = mgr.rotate();
    expect(rotated.length).toBe(1);
    expect(rotated[0].serial).not.toBe(c1.serial);
    expect(rotated[0].expiresAtMs).toBe(19_000);
  });

  it('peerAllowed checks trust domain', () => {
    const mgr = new SpiffeIdentityManager('example.mesh', new ManualClock(0));
    expect(mgr.peerAllowed(
      'spiffe://example.mesh/ns/a/sa/x',
      'spiffe://example.mesh/ns/b/sa/y'
    )).toBe(true);
    expect(mgr.peerAllowed(
      'spiffe://example.mesh/ns/a/sa/x',
      'spiffe://other.mesh/ns/b/sa/y'
    )).toBe(false);
  });
});
