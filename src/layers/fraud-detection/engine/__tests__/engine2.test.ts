/**
 * Fraud-detection engine additions — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DeviceIntelligence,
  SessionAnalyzer,
  CrossChannelLinker,
  AdaptiveThresholds,
  ManualFraudClock,
  SessionAction,
} from '../index';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ------------------------------------------------------------------ */
/* DeviceIntelligence                                                  */
/* ------------------------------------------------------------------ */

describe('DeviceIntelligence', () => {
  let clock: ManualFraudClock;
  let intel: DeviceIntelligence;

  beforeEach(() => {
    clock = new ManualFraudClock();
    intel = new DeviceIntelligence({}, clock);
  });

  it('a brand-new device is risky; an established one is not', () => {
    intel.observe('burner', 'user1');
    const young = intel.signal('burner')!;
    expect(young.ageMs).toBe(0);
    expect(young.riskScore).toBeGreaterThan(0.2);
    expect(young.reasons).toContain('young device');

    clock.advance(40 * DAY);
    intel.observe('olddevice', 'user1');
    // fake history by observing at t=0 then querying later
    clock.set(0);
    const intel2 = new DeviceIntelligence({}, clock);
    intel2.observe('established', 'user1');
    clock.advance(60 * DAY);
    const old = intel2.signal('established')!;
    expect(old.reasons).not.toContain('young device');
  });

  it('trust score rises with clean outcomes, falls with fraud', () => {
    intel.observe('d1', 'u1');
    const neutral = intel.trust('d1');
    expect(neutral).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 5; i++) intel.observe('d1', 'u1', undefined, 'clean');
    const trusted = intel.trust('d1');
    expect(trusted).toBeGreaterThan(0.8);
    intel.observe('d1', 'u1', undefined, 'fraud');
    intel.observe('d1', 'u1', undefined, 'chargeback');
    expect(intel.trust('d1')).toBeLessThan(trusted);
  });

  it('trust decays toward neutral while the device is quiet', () => {
    intel.observe('d1', 'u1', undefined, 'clean');
    intel.observe('d1', 'u1', undefined, 'clean');
    intel.observe('d1', 'u1', undefined, 'clean');
    const high = intel.trust('d1');
    clock.advance(90 * DAY); // 3 half-lives
    const decayed = intel.trust('d1');
    expect(decayed).toBeLessThan(high);
    expect(decayed).toBeGreaterThan(0.5);
  });

  it('account fan-out raises risk (device farm pattern)', () => {
    for (let i = 0; i < 8; i++) intel.observe('farm-device', `acct-${i}`);
    const s = intel.signal('farm-device')!;
    expect(s.accountCount).toBe(8);
    expect(s.riskScore).toBeGreaterThan(0.5);
    expect(s.reasons.some((r) => r.includes('accounts'))).toBe(true);
  });

  it('shared-device fan-out links accounts↔devices both ways', () => {
    intel.observe('devA', 'u1');
    intel.observe('devB', 'u1');
    intel.observe('devC', 'u2');
    intel.observe('devB', 'u2');
    expect(intel.devicesFor('u1').sort()).toEqual(['devA', 'devB']);
    expect(intel.accountsFor('devB').sort()).toEqual(['u1', 'u2']);
    const s = intel.signal('devA')!;
    // u1 has devA+devB; devB also serves u2 → sharedDeviceCount ≥ 2
    expect(s.sharedDeviceCount).toBeGreaterThanOrEqual(2);
  });

  it('unknown devices return neutral trust and no signal', () => {
    expect(intel.signal('ghost')).toBeUndefined();
    expect(intel.trust('ghost')).toBe(0.5);
  });

  it('prune() drops stale devices and cleans reverse indexes', () => {
    intel.observe('gone', 'u1');
    intel.observe('staying', 'u1');
    clock.advance(100 * DAY);
    intel.observe('staying', 'u1'); // still active
    expect(intel.prune(90 * DAY)).toBe(1);
    expect(intel.signal('gone')).toBeUndefined();
    expect(intel.devicesFor('u1')).toEqual(['staying']);
  });
});

/* ------------------------------------------------------------------ */
/* SessionAnalyzer                                                     */
/* ------------------------------------------------------------------ */

describe('SessionAnalyzer', () => {
  let analyzer: SessionAnalyzer;

  const act = (kind: string, at: number, target?: string): SessionAction => ({
    kind,
    at,
    target,
  });

  beforeEach(() => {
    analyzer = new SessionAnalyzer({ minActions: 4 });
  });

  it('flags metronomic scripted sessions as bot-like', () => {
    // perfect 200ms gaps, identical action — a script
    for (let i = 0; i < 20; i++) {
      analyzer.record('bot', act('click', i * 200, 'same-button'));
    }
    const f = analyzer.features('bot')!;
    expect(f.gapStddevMs).toBe(0);
    expect(f.pathEntropyBits).toBe(0);
    expect(f.actionDiversity).toBeLessThanOrEqual(0.1);
    expect(f.botScore).toBeGreaterThan(0.6);
  });

  it('scores human-varied sessions low', () => {
    // irregular gaps, varied targets — a person browsing
    const gaps = [1200, 3400, 800, 2600, 5100, 900, 4100, 1800, 700, 3300];
    let t = 0;
    const targets = ['home', 'search', 'cat', 'item1', 'item2', 'cart', 'item3', 'reviews', 'checkout', 'pay'];
    for (let i = 0; i < gaps.length; i++) {
      analyzer.record('human', act(['view', 'click', 'scroll', 'type', 'click', 'view', 'click', 'scroll', 'click', 'view'][i], t, targets[i]));
      t += gaps[i];
    }
    const f = analyzer.features('human')!;
    expect(f.gapStddevMs).toBeGreaterThan(0);
    expect(f.pathEntropyBits).toBeGreaterThan(3);
    expect(f.botScore).toBeLessThan(0.35);
  });

  it('computes Shannon entropy over navigation targets', () => {
    // 4 targets × 5 visits each = uniform → log2(4) = 2 bits
    for (let i = 0; i < 20; i++) {
      analyzer.record('s', act('view', i * 1000, `p${i % 4}`));
    }
    expect(analyzer.features('s')!.pathEntropyBits).toBeCloseTo(2, 6);
  });

  it('insufficient-data sessions score 0', () => {
    analyzer.record('tiny', act('view', 0));
    analyzer.record('tiny', act('view', 100));
    expect(analyzer.features('tiny')!.botScore).toBe(0);
  });

  it('anomalousForUser detects session shape change', () => {
    // user's normal sessions: high-entropy browsing
    for (let s = 0; s < 3; s++) {
      const id = `normal-${s}`;
      for (let i = 0; i < 10; i++) {
        analyzer.record(id, act(['view', 'click', 'scroll'][i % 3], i * (700 + i * 300), `t${i}`), 'victim');
      }
    }
    // hijacked session: robotic single-target replay
    for (let i = 0; i < 10; i++) {
      analyzer.record('hijacked', act('click', i * 150, 'transfer'), 'victim');
    }
    expect(analyzer.anomalousForUser('victim', 'hijacked')).toBe(true);
    expect(analyzer.anomalousForUser('victim', 'normal-0')).toBe(false);
  });

  it('close() releases session memory', () => {
    analyzer.record('x', act('view', 0));
    expect(analyzer.close('x')).toBe(true);
    expect(analyzer.features('x')).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* CrossChannelLinker                                                  */
/* ------------------------------------------------------------------ */

describe('CrossChannelLinker', () => {
  let clock: ManualFraudClock;
  let linker: CrossChannelLinker;

  beforeEach(() => {
    clock = new ManualFraudClock();
    linker = new CrossChannelLinker({}, clock);
  });

  it('detects rapid web→mobile channel switches', () => {
    clock.set(1_000_000);
    linker.observe({ userId: 'u', channel: 'web', deviceId: 'laptop', at: clock.now() });
    clock.advance(60_000);
    linker.observe({ userId: 'u', channel: 'mobile', deviceId: 'phone', at: clock.now() });
    clock.advance(60_000);
    linker.observe({ userId: 'u', channel: 'api', deviceId: 'script', at: clock.now() });
    const s = linker.signal('u')!;
    expect(s.channels.sort()).toEqual(['api', 'mobile', 'web']);
    expect(s.switchesLastHour).toBeGreaterThanOrEqual(2);
    expect(s.riskScore).toBeGreaterThan(0.3);
  });

  it('shared devices across channels reduce risk (identity-confirming)', () => {
    const flagged = new CrossChannelLinker({}, clock);
    // user with flag but NO shared device
    flagged.observe({ userId: 'victim', channel: 'web', deviceId: 'a', at: 0 });
    flagged.observe({ userId: 'victim', channel: 'mobile', deviceId: 'b', at: 1000, flagged: true });
    const noShared = flagged.signal('victim')!;

    const linked = new CrossChannelLinker({}, clock);
    // same flags, but one device seen on both channels
    linked.observe({ userId: 'legit', channel: 'web', deviceId: 'phone', at: 0 });
    linked.observe({ userId: 'legit', channel: 'mobile', deviceId: 'phone', at: 1000, flagged: true });
    const withShared = linked.signal('legit')!;

    expect(withShared.sharedDevices).toEqual(['phone']);
    expect(withShared.riskScore).toBeLessThan(noShared.riskScore);
  });

  it('flagged events on one channel poison the user everywhere', () => {
    linker.observe({ userId: 'u', channel: 'api', at: 0, flagged: true });
    linker.observe({ userId: 'u', channel: 'web', deviceId: 'd', at: 100 });
    const s = linker.signal('u')!;
    expect(s.flaggedCount).toBe(1);
    expect(s.riskScore).toBeGreaterThan(0.2);
    expect(s.reasons.some((r) => r.includes('flagged'))).toBe(true);
  });

  it('isNewChannelDevice answers step-up-auth questions', () => {
    linker.observe({ userId: 'u', channel: 'web', deviceId: 'laptop', at: 0 });
    expect(linker.isNewChannelDevice('u', 'web', 'laptop')).toBe(false);
    expect(linker.isNewChannelDevice('u', 'mobile', 'laptop')).toBe(true);
    expect(linker.isNewChannelDevice('u', 'web', 'stranger')).toBe(true);
  });

  it('flags expire out of the flag window', () => {
    linker.observe({ userId: 'u', channel: 'web', at: 0, flagged: true });
    clock.advance(31 * DAY);
    const s = linker.signal('u')!;
    expect(s.flaggedCount).toBe(0);
  });

  it('devicesFor unions across channels', () => {
    linker.observe({ userId: 'u', channel: 'web', deviceId: 'a', at: 0 });
    linker.observe({ userId: 'u', channel: 'mobile', deviceId: 'b', at: 1 });
    linker.observe({ userId: 'u', channel: 'mobile', deviceId: 'a', at: 2 });
    expect(linker.devicesFor('u')).toEqual(['a', 'b']);
  });
});

/* ------------------------------------------------------------------ */
/* AdaptiveThresholds                                                  */
/* ------------------------------------------------------------------ */

describe('AdaptiveThresholds', () => {
  let thresholds: AdaptiveThresholds;

  beforeEach(() => {
    thresholds = new AdaptiveThresholds({ scoreMin: 0, scoreMax: 100 });
  });

  it('applies default flag/block thresholds per merchant', () => {
    expect(thresholds.decide('m1', 30).decision).toBe('approve');
    expect(thresholds.decide('m1', 50).decision).toBe('review');
    expect(thresholds.decide('m1', 80).decision).toBe('decline');
  });

  it('tightens after confirmed fraud (misses cost more)', () => {
    const before = thresholds.profile('jeweler');
    // fraud slipped through at score 35 (below flag threshold)
    thresholds.feedback('jeweler', 35, 'fraud-confirmed');
    const after = thresholds.profile('jeweler');
    expect(after.flagThreshold).toBeLessThan(before.flagThreshold);
    expect(after.blockThreshold).toBeLessThan(before.blockThreshold);
    expect(after.observedFraudRate).toBeGreaterThan(0);
  });

  it('loosens after false alarms', () => {
    thresholds.feedback('cafe', 75, 'false-alarm');
    const p = thresholds.profile('cafe');
    expect(p.flagThreshold).toBeGreaterThan(40);
    expect(p.blockThreshold).toBeGreaterThan(70);
  });

  it('keeps flag < block invariant under repeated feedback', () => {
    for (let i = 0; i < 50; i++) {
      thresholds.feedback('m', 50, i % 2 === 0 ? 'fraud-confirmed' : 'false-alarm');
    }
    const p = thresholds.profile('m');
    expect(p.flagThreshold).toBeLessThan(p.blockThreshold);
  });

  it('converges: sustained fraud pressure → eventually declines that score', () => {
    // repeat misses at score 55 — threshold should drop below it
    for (let i = 0; i < 30; i++) {
      thresholds.feedback('target', 55, 'fraud-confirmed');
    }
    const d = thresholds.decide('target', 55);
    expect(d.decision).not.toBe('approve');
  });

  it('fpPressure reports budget overshoot', () => {
    for (let i = 0; i < 10; i++) thresholds.feedback('m', 60, 'false-alarm');
    const d = thresholds.decide('m', 50);
    expect(d.fpPressure).toBeGreaterThan(0);
  });

  it('merchants adapt independently', () => {
    for (let i = 0; i < 10; i++) thresholds.feedback('strict', 50, 'fraud-confirmed');
    const strict = thresholds.profile('strict');
    const lax = thresholds.profile('lax');
    expect(strict.flagThreshold).toBeLessThan(lax.flagThreshold);
  });

  it('reset restores defaults', () => {
    thresholds.feedback('m', 50, 'fraud-confirmed');
    thresholds.reset('m');
    expect(thresholds.profile('m').flagThreshold).toBeCloseTo(40, 6);
  });
});
