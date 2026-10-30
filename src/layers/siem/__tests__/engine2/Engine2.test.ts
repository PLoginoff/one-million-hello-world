/**
 * SIEM engine2 tests — threat intel, UBA, timeline, FP bank.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine';
import type { NormalizedEvent } from '../../engine/EventNormalizer';
import type { Alert } from '../../engine/AlertManager';
import {
  BehaviorAnalytics,
  DEFAULT_UBA_WEIGHTS,
  distillSignature,
  FalsePositiveBank,
  IncidentTimeline,
  signatureMatches,
  ThreatIntelFeed,
} from '../../engine2';

let seq = 0;
function ev(over: Partial<NormalizedEvent>): NormalizedEvent {
  seq += 1;
  return {
    id: seq,
    timestampMs: 0,
    raw: '',
    severity: 'info',
    outcome: 'unknown',
    fields: {},
    parseQuality: 'full',
    ...over,
  };
}

function alert(over: Partial<Alert>): Alert {
  return {
    id: 'a1',
    dedupKey: 'd',
    ruleId: 'r-1',
    title: 't',
    status: 'resolved',
    severity: 'warning',
    score: 50,
    firedAtMs: 0,
    lastFiredMs: 0,
    occurrences: 1,
    eventIds: [],
    ...over,
  } as Alert;
}

const HOUR = 3_600_000;

// ------------------------------------------------------- threat intel

describe('ThreatIntelFeed', () => {
  let clock: ManualClock;
  let feed: ThreatIntelFeed;

  beforeEach(() => {
    clock = new ManualClock(1_000);
    feed = new ThreatIntelFeed(clock);
  });

  it('matches source/dest IPs exactly', () => {
    feed.ingest('blocklist', [{ type: 'ip', value: '10.0.0.66', feed: 'blocklist' }]);
    const hits = feed.scan(ev({ sourceIp: '10.0.0.66' }));
    expect(hits.length).toBe(1);
    expect(hits[0].field).toBe('sourceIp');
    expect(feed.scan(ev({ destIp: '10.0.0.66' }))[0].field).toBe('destIp');
    expect(feed.scan(ev({ sourceIp: '10.0.0.67' })).length).toBe(0);
  });

  it('domain indicators match subdomains via suffix walk', () => {
    feed.ingest('dns', [{ type: 'domain', value: 'evil.com', feed: 'dns' }]);
    expect(feed.scan(ev({ fields: { domain: 'evil.com' } })).length).toBe(1);
    expect(feed.scan(ev({ fields: { domain: 'a.b.evil.com' } })).length).toBe(1);
    expect(feed.scan(ev({ fields: { domain: 'not-evil.com' } })).length).toBe(0);
    expect(feed.scan(ev({ fields: { domain: 'evil.com.evil.org' } })).length).toBe(0);
  });

  it('expired indicators stop matching and sweep reclaims them', () => {
    feed.ingest('tmp', [
      { type: 'ip', value: '1.2.3.4', feed: 'tmp', expiresAtMs: 2_000 },
    ]);
    expect(feed.scan(ev({ sourceIp: '1.2.3.4' })).length).toBe(1);
    clock.set(3_000);
    expect(feed.scan(ev({ sourceIp: '1.2.3.4' })).length).toBe(0);
    expect(feed.stats()[0].expiredPendingSweep).toBe(1);
    expect(feed.sweep()).toBe(1);
    expect(feed.stats()[0].indicators).toBe(0);
  });

  it('re-ingest refreshes an indicator', () => {
    feed.ingest('f', [{ type: 'ip', value: '9.9.9.9', feed: 'f', expiresAtMs: 5 }]);
    clock.set(10);
    feed.ingest('f', [{ type: 'ip', value: '9.9.9.9', feed: 'f', expiresAtMs: 100 }]);
    expect(feed.lookup('ip', '9.9.9.9')).toBeDefined();
  });

  it('evictFeed removes only that feed', () => {
    feed.ingest('a', [{ type: 'ip', value: '1.1.1.1', feed: 'a' }]);
    feed.ingest('b', [{ type: 'ip', value: '2.2.2.2', feed: 'b' }]);
    feed.evictFeed('a');
    expect(feed.lookup('ip', '1.1.1.1')).toBeUndefined();
    expect(feed.lookup('ip', '2.2.2.2')).toBeDefined();
  });

  it('records provenance + confidence on matches', () => {
    feed.ingest('premium', [
      { type: 'ip', value: '5.5.5.5', feed: 'premium', confidence: 95 },
    ]);
    const hit = feed.scan(ev({ sourceIp: '5.5.5.5' }))[0];
    expect(hit.feed).toBe('premium');
    expect(hit.confidence).toBe(95);
  });
});

// --------------------------------------------------------------- UBA

describe('BehaviorAnalytics', () => {
  let clock: ManualClock;
  let uba: BehaviorAnalytics;

  beforeEach(() => {
    clock = new ManualClock(0);
    uba = new BehaviorAnalytics(clock);
  });

  /** Build a baseline: user logs in from 1.2.3.4 at 9am every day. */
  function train(user: string, days = 30): void {
    for (let d = 0; d < days; d++) {
      const t = d * 24 * HOUR + 9 * HOUR;
      uba.observe(ev({ user, action: 'login', sourceIp: '1.2.3.4', timestampMs: t }));
    }
  }

  it('scores a new user with the new-user factor only', () => {
    const s = uba.score(ev({ user: 'brand-new', action: 'login', sourceIp: '8.8.8.8' }));
    expect(s.score).toBeCloseTo(DEFAULT_UBA_WEIGHTS.newUser, 9);
    expect(s.factors[0].factor).toBe('new-user');
  });

  it('typical behaviour scores near zero', () => {
    train('alice');
    const s = uba.score(
      ev({ user: 'alice', action: 'login', sourceIp: '1.2.3.4', timestampMs: 30 * 24 * HOUR + 9 * HOUR }),
    );
    expect(s.score).toBeLessThan(0.1);
  });

  it('new IP + unusual hour + unusual action compound', () => {
    train('bob');
    const s = uba.score(
      ev({ user: 'bob', action: 'exfil', sourceIp: '6.6.6.6', timestampMs: 30 * 24 * HOUR + 3 * HOUR }),
    );
    const kinds = s.factors.map((f) => f.factor);
    expect(kinds).toContain('new-ip');
    expect(kinds).toContain('unusual-hour');
    expect(kinds).toContain('unusual-action');
    expect(s.score).toBeGreaterThan(0.5);
  });

  it('baseline exposes learned histograms', () => {
    train('carol', 25);
    const b = uba.baseline('carol');
    expect(b?.totalEvents).toBe(25);
    expect(b?.actions['login']).toBe(25);
    expect(b?.knownIps).toEqual(['1.2.3.4']);
    expect(b?.hourHistogram[9]).toBe(25);
  });

  it('ingest scores then folds the event into the baseline', () => {
    train('dave');
    const before = uba.baseline('dave')!.totalEvents;
    uba.ingest(ev({ user: 'dave', action: 'login', sourceIp: '1.2.3.4', timestampMs: 40 * 24 * HOUR }));
    expect(uba.baseline('dave')!.totalEvents).toBe(before + 1);
  });
});

// ----------------------------------------------------------- timeline

describe('IncidentTimeline', () => {
  it('clusters same-user events within the link window', () => {
    const t = new IncidentTimeline({ linkWindowMs: 10_000, minIncidentSize: 3 });
    const events = [
      ev({ id: 1, user: 'mallory', timestampMs: 0, action: 'login' }),
      ev({ id: 2, user: 'mallory', timestampMs: 5_000, action: 'file-read' }),
      ev({ id: 3, user: 'mallory', timestampMs: 9_000, action: 'exfil' }),
      ev({ id: 4, user: 'innocent', timestampMs: 9_500, action: 'logout' }),
    ];
    const inc = t.reconstruct(events);
    expect(inc.length).toBe(1);
    expect(inc[0].events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(inc[0].pivotEntities).toEqual(['user:mallory']);
  });

  it('merges clusters through a shared pivot (ip bridges users)', () => {
    const t = new IncidentTimeline({ linkWindowMs: 10_000, minIncidentSize: 2 });
    const events = [
      ev({ id: 1, user: 'u1', sourceIp: '9.9.9.9', timestampMs: 0 }),
      ev({ id: 2, user: 'u1', timestampMs: 1_000 }),
      // u2 shares the IP → joins the cluster even though different user
      ev({ id: 3, user: 'u2', sourceIp: '9.9.9.9', timestampMs: 2_000 }),
    ];
    const inc = t.reconstruct(events);
    expect(inc.length).toBe(1);
    expect(inc[0].events.length).toBe(3);
  });

  it('splits clusters beyond the link window', () => {
    const t = new IncidentTimeline({ linkWindowMs: 5_000, minIncidentSize: 2 });
    const events = [
      ev({ id: 1, user: 'u', timestampMs: 0 }),
      ev({ id: 2, user: 'u', timestampMs: 1_000 }),
      ev({ id: 3, user: 'u', timestampMs: 60_000 }), // gap too big
      ev({ id: 4, user: 'u', timestampMs: 61_000 }),
    ];
    const inc = t.reconstruct(events);
    expect(inc.length).toBe(2);
  });

  it('minIncidentSize filters out singletons', () => {
    const t = new IncidentTimeline({ linkWindowMs: 10_000, minIncidentSize: 3 });
    const events = [ev({ id: 1, user: 'solo', timestampMs: 0 })];
    expect(t.reconstruct(events).length).toBe(0);
  });

  it('reports max severity across member events', () => {
    const t = new IncidentTimeline({ linkWindowMs: 10_000, minIncidentSize: 2 });
    const events = [
      ev({ id: 1, user: 'u', severity: 'info', timestampMs: 0 }),
      ev({ id: 2, user: 'u', severity: 'crit', timestampMs: 1_000 }),
      ev({ id: 3, user: 'u', severity: 'warning', timestampMs: 2_000 }),
    ];
    expect(t.reconstruct(events)[0].severity).toBe('crit');
  });
});

// -------------------------------------------------------- FP bank

describe('FalsePositiveBank', () => {
  let clock: ManualClock;
  let bank: FalsePositiveBank;

  beforeEach(() => {
    clock = new ManualClock(0);
    bank = new FalsePositiveBank(
      { signatureFields: ['user', 'sourceIp', 'action'], ruleTtlMs: 1_000, maxRules: 100 },
      clock,
    );
  });

  it('distillSignature keeps only universally-shared allowed fields', () => {
    const events = [
      ev({ user: 'bob', sourceIp: '1.1.1.1', action: 'login' }),
      ev({ user: 'bob', sourceIp: '1.1.1.1', action: 'logout' }), // action differs
    ];
    expect(distillSignature(events, ['user', 'sourceIp', 'action'])).toEqual({
      user: 'bob',
      sourceIp: '1.1.1.1',
    });
  });

  it('learned rule suppresses matching future events', () => {
    const a = alert({ id: 'A1', ruleId: 'noisy-login' });
    bank.learn(a, [ev({ user: 'backup-svc', sourceIp: '10.1.1.1', action: 'login' })]);
    const d = bank.check('noisy-login', ev({ user: 'backup-svc', sourceIp: '10.1.1.1', action: 'login' }));
    expect(d.suppressed).toBe(true);
    expect(d.ruleId).toBe('fp-1');
    // Wrong user → not suppressed.
    expect(bank.check('noisy-login', ev({ user: 'eve', sourceIp: '10.1.1.1', action: 'login' })).suppressed).toBe(false);
    // Different rule → not suppressed.
    expect(bank.check('other-rule', ev({ user: 'backup-svc', sourceIp: '10.1.1.1', action: 'login' })).suppressed).toBe(false);
  });

  it('suppressedCount tracks how often a rule fired', () => {
    const a = alert({ id: 'A2', ruleId: 'r' });
    bank.learn(a, [ev({ user: 'svc' })]);
    bank.check('r', ev({ user: 'svc' }));
    bank.check('r', ev({ user: 'svc' }));
    expect(bank.rules()[0].suppressedCount).toBe(2);
  });

  it('learn returns undefined when events share nothing', () => {
    const a = alert({ id: 'A3', ruleId: 'r' });
    const r = bank.learn(a, [
      ev({ user: 'a', sourceIp: '1.1.1.1' }),
      ev({ user: 'b', sourceIp: '2.2.2.2' }),
    ]);
    expect(r).toBeUndefined();
  });

  it('expired rules stop suppressing and sweep removes them', () => {
    const a = alert({ id: 'A4', ruleId: 'r' });
    bank.learn(a, [ev({ user: 'temp' })]);
    clock.set(2_000);
    expect(bank.check('r', ev({ user: 'temp' })).suppressed).toBe(false);
    expect(bank.sweep()).toBe(1);
  });

  it('signatureMatches honors every field', () => {
    const e = ev({ user: 'x', sourceIp: '1.2.3.4' });
    expect(signatureMatches({ user: 'x' }, e)).toBe(true);
    expect(signatureMatches({ user: 'x', sourceIp: '1.2.3.4' }, e)).toBe(true);
    expect(signatureMatches({ user: 'x', sourceIp: '9.9.9.9' }, e)).toBe(false);
  });
});
