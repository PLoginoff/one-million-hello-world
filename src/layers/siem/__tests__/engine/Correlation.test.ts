/**
 * Correlation engine tests — sequence detection, windows, grouping.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  CorrelationEngine,
  EventNormalizer,
  NormalizedEvent,
  bruteForceRule,
  match,
} from '../../engine';

let seq = 0;
function evt(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: ++seq,
    timestampMs: 0,
    raw: 'x',
    severity: 'info',
    outcome: 'unknown',
    fields: {},
    parseQuality: 'full',
    ...partial,
  };
}

describe('CorrelationEngine', () => {
  let clock: ManualClock;
  let engine: CorrelationEngine;

  beforeEach(() => {
    clock = new ManualClock(1_000_000);
    engine = new CorrelationEngine(clock);
  });

  it('detects brute force: N failures + success in window', () => {
    engine.addRule(bruteForceRule({ failureCount: 3, windowMs: 300_000 }));
    const ip = '10.0.0.9';
    let fired = engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: ip, user: 'bob', timestampMs: clock.nowMs() }));
    expect(fired.length).toBe(0);
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: ip, user: 'bob', timestampMs: clock.nowMs() }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: ip, user: 'bob', timestampMs: clock.nowMs() }));
    fired = engine.ingest(evt({ action: 'login', outcome: 'success', sourceIp: ip, user: 'bob', timestampMs: clock.nowMs() }));
    expect(fired.length).toBe(1);
    expect(fired[0].ruleId).toBe('brute-force-login');
    expect(fired[0].events.length).toBe(4);
  });

  it('does not fire when success comes from a different IP', () => {
    engine.addRule(bruteForceRule({ failureCount: 2, windowMs: 300_000 }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'bob' }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'bob' }));
    const fired = engine.ingest(
      evt({ action: 'login', outcome: 'success', sourceIp: '2.2.2.2', user: 'bob' })
    );
    expect(fired.length).toBe(0);
  });

  it('does not fire when success is for a different user', () => {
    engine.addRule(bruteForceRule({ failureCount: 2, windowMs: 300_000 }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'alice' }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'alice' }));
    const fired = engine.ingest(
      evt({ action: 'login', outcome: 'success', sourceIp: '1.1.1.1', user: 'carol' })
    );
    expect(fired.length).toBe(0);
  });

  it('expires candidates after the window', () => {
    engine.addRule(bruteForceRule({ failureCount: 2, windowMs: 60_000 }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'a', timestampMs: 0 }));
    clock.advance(120_000);
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'a', timestampMs: clock.nowMs() }));
    const fired = engine.ingest(
      evt({ action: 'login', outcome: 'success', sourceIp: '1.1.1.1', user: 'a', timestampMs: clock.nowMs() })
    );
    // Only 1 failure in the live window → no match.
    expect(fired.length).toBe(0);
    expect(engine.getStats().candidatesExpired).toBeGreaterThanOrEqual(1);
  });

  it('counts a threshold of matches per step', () => {
    engine.addRule({
      id: 'port-scan',
      name: 'Port scan',
      description: 'many denied connections',
      windowMs: 60_000,
      severity: 'medium',
      steps: [{ name: 'denies', match: match.and(match.action('network'), match.outcome('failure')), count: 5 }],
    });
    for (let i = 0; i < 4; i++) {
      expect(engine.ingest(evt({ action: 'network', outcome: 'failure', sourceIp: '9.9.9.9' })).length).toBe(0);
    }
    const fired = engine.ingest(evt({ action: 'network', outcome: 'failure', sourceIp: '9.9.9.9' }));
    expect(fired.length).toBe(1);
    expect(fired[0].events.length).toBe(5);
  });

  it('enforces per-step withinMs gap', () => {
    engine.addRule({
      id: 'quick-escape',
      name: 'Fail then fast success',
      description: 'success within 1s of failure is suspicious',
      windowMs: 60_000,
      severity: 'high',
      steps: [
        { name: 'fail', match: match.and(match.action('login'), match.outcome('failure')) },
        { name: 'win', match: match.and(match.action('login'), match.outcome('success')), withinMs: 1_000 },
      ],
    });
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'u', timestampMs: 0 }));
    const fired = engine.ingest(
      evt({ action: 'login', outcome: 'success', sourceIp: '1.1.1.1', user: 'u', timestampMs: 5_000 })
    );
    expect(fired.length).toBe(0); // gap too long
  });

  it('dedup key groups by user+ip', () => {
    engine.addRule(bruteForceRule({ failureCount: 1, windowMs: 60_000 }));
    engine.ingest(evt({ action: 'login', outcome: 'failure', sourceIp: '1.1.1.1', user: 'bob' }));
    const fired = engine.ingest(evt({ action: 'login', outcome: 'success', sourceIp: '1.1.1.1', user: 'bob' }));
    expect(fired[0].dedupKey).toBe('brute-force-login:bob:1.1.1.1');
  });
});
