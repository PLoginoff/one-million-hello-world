/**
 * Bot-Detection Engine — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BiometricAnalyzer,
  FingerprintRegistry,
  EscalationPolicy,
  BotnetDetector,
  ManualBotClock,
  Keystroke,
  MousePoint,
} from '../index';

/* ------------------------------------------------------------------ */
/* BiometricAnalyzer                                                    */
/* ------------------------------------------------------------------ */

describe('BiometricAnalyzer', () => {
  const ba = new BiometricAnalyzer();

  const humanKeys: Keystroke[] = [
    { key: 'a', dwellMs: 85, flightMs: 0 },
    { key: 'b', dwellMs: 120, flightMs: 180 },
    { key: 'c', dwellMs: 92, flightMs: 220 },
    { key: 'd', dwellMs: 140, flightMs: 90 },
    { key: 'e', dwellMs: 77, flightMs: 310 },
    { key: 'f', dwellMs: 110, flightMs: 150 },
    { key: 'g', dwellMs: 95, flightMs: 260 },
    { key: 'h', dwellMs: 88, flightMs: 110 },
  ];

  const botKeys: Keystroke[] = [
    { key: 'a', dwellMs: 80, flightMs: 0 },
    { key: 'b', dwellMs: 80, flightMs: 50 },
    { key: 'c', dwellMs: 80, flightMs: 50 },
    { key: 'd', dwellMs: 80, flightMs: 50 },
    { key: 'e', dwellMs: 80, flightMs: 50 },
    { key: 'f', dwellMs: 80, flightMs: 50 },
    { key: 'g', dwellMs: 80, flightMs: 50 },
    { key: 'h', dwellMs: 80, flightMs: 50 },
  ];

  it('scores scripted keystrokes as bot', () => {
    const r = ba.analyzeKeystrokes(botKeys);
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('scores varied keystrokes as human', () => {
    const r = ba.analyzeKeystrokes(humanKeys);
    expect(r.score).toBeLessThan(0.5);
  });

  it('neutral on insufficient data', () => {
    const r = ba.analyzeKeystrokes(botKeys.slice(0, 2));
    expect(r.score).toBe(0.5);
  });

  it('constant dwell → zero entropy', () => {
    const r = ba.analyzeKeystrokes(botKeys);
    expect(r.features.dwellEntropy).toBe(0);
  });

  it('straight constant-speed mouse path → bot', () => {
    const pts: MousePoint[] = [];
    for (let i = 0; i < 20; i++) {
      pts.push({ x: i * 10, y: i * 10, t: i * 16 }); // perfectly linear
    }
    const r = ba.analyzeMousePath(pts);
    expect(r.features.linearity).toBeGreaterThan(0.99);
    expect(r.features.speedCv).toBeLessThan(0.05);
    expect(r.score).toBeGreaterThan(0.7);
  });

  it('wandering mouse path → human', () => {
    const pts: MousePoint[] = [
      { x: 0, y: 0, t: 0 },
      { x: 5, y: 20, t: 30 },
      { x: 3, y: 10, t: 80 },
      { x: 25, y: 40, t: 130 },
      { x: 10, y: 15, t: 200 },
      { x: 40, y: 35, t: 400 },
      { x: 20, y: 60, t: 700 },
      { x: 55, y: 50, t: 1000 },
      { x: 30, y: 80, t: 1500 },
      { x: 70, y: 70, t: 2100 },
    ];
    const r = ba.analyzeMousePath(pts);
    expect(r.features.linearity).toBeLessThan(0.99);
    expect(r.score).toBeLessThan(0.7);
  });
});

/* ------------------------------------------------------------------ */
/* FingerprintRegistry                                                  */
/* ------------------------------------------------------------------ */

describe('FingerprintRegistry', () => {
  let reg: FingerprintRegistry;
  const fp = (ua: string, canvas: string, tz = 'utc') => ({
    components: { ua, canvas, tz },
    at: 0,
  });

  beforeEach(() => {
    reg = new FingerprintRegistry({ stabilizationCount: 3 });
  });

  it('stabilizes after N observations', () => {
    reg.observe('u', fp('chrome', 'c1'));
    reg.observe('u', fp('chrome', 'c1'));
    const d = reg.observe('u', fp('chrome', 'c1'));
    expect(d.observations).toBe(3);
    expect(reg.established('u')).toEqual({ ua: 'chrome', canvas: 'c1', tz: 'utc' });
  });

  it('detects a full fingerprint swap', () => {
    for (let i = 0; i < 3; i++) reg.observe('u', fp('chrome', 'c1'));
    const d = reg.observe('u', fp('firefox', 'c2', 'est'));
    expect(d.changed.sort()).toEqual(['canvas', 'tz', 'ua']);
    expect(d.score).toBeGreaterThan(0.9);
  });

  it('partial drift scores fractionally', () => {
    for (let i = 0; i < 3; i++) reg.observe('u', fp('chrome', 'c1'));
    const d = reg.observe('u', fp('chrome', 'c1', 'pst')); // tz only
    expect(d.changed).toEqual(['tz']);
    expect(d.score).toBeCloseTo(1 / 3);
  });

  it('majority rules after drift stabilizes', () => {
    for (let i = 0; i < 3; i++) reg.observe('u', fp('chrome', 'c1'));
    for (let i = 0; i < 4; i++) reg.observe('u', fp('firefox', 'c1'));
    // established should flip to firefox after majority of observations
    expect(reg.established('u')?.['ua']).toBe('firefox');
  });

  it('fingerprintCount tracks distinct fingerprints', () => {
    reg.observe('u', fp('chrome', 'c1'));
    reg.observe('u', fp('chrome', 'c1'));
    reg.observe('u', fp('firefox', 'c9'));
    expect(reg.fingerprintCount('u')).toBe(2);
  });

  it('heavy components weight double', () => {
    const heavy = new FingerprintRegistry({
      stabilizationCount: 3,
      heavyComponents: ['canvas'],
    });
    for (let i = 0; i < 3; i++) heavy.observe('u', fp('chrome', 'c1'));
    // change canvas only → 2/(2+1+1) = 0.5
    const d = heavy.observe('u', fp('chrome', 'c9'));
    expect(d.score).toBeCloseTo(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* EscalationPolicy                                                     */
/* ------------------------------------------------------------------ */

describe('EscalationPolicy', () => {
  let ep: EscalationPolicy;
  beforeEach(() => {
    ep = new EscalationPolicy(new ManualBotClock());
  });

  it('maps score bands to challenge levels', () => {
    expect(ep.decide('s', 0.1).level).toBe('pass');
    expect(ep.decide('s', 0.4).level).toBe('silent-cookie');
    expect(ep.decide('s', 0.6).level).toBe('captcha-checkbox');
    expect(ep.decide('s', 0.8).level).toBe('captcha-puzzle');
    expect(ep.decide('s', 0.9).level).toBe('js-challenge');
    expect(ep.decide('s', 0.99).level).toBe('block');
  });

  it('failed challenge escalates one level', () => {
    ep.recordFailure('s');
    // score 0.1 → normally pass; with a failure → silent-cookie
    expect(ep.decide('s', 0.1).level).toBe('silent-cookie');
    ep.recordFailure('s');
    expect(ep.decide('s', 0.1).level).toBe('captcha-checkbox');
  });

  it('escalation is per-subject', () => {
    ep.recordFailure('bad');
    expect(ep.decide('good', 0.1).level).toBe('pass');
  });

  it('passing a challenge resets escalation', () => {
    ep.recordFailure('s');
    ep.recordPass('s');
    expect(ep.decide('s', 0.1).level).toBe('pass');
    expect(ep.escalationOf('s')).toBe(0);
  });

  it('escalation caps at block', () => {
    for (let i = 0; i < 10; i++) ep.recordFailure('s');
    expect(ep.decide('s', 0.9).level).toBe('block');
  });
});

/* ------------------------------------------------------------------ */
/* BotnetDetector                                                       */
/* ------------------------------------------------------------------ */

describe('BotnetDetector', () => {
  let clock: ManualBotClock;
  let bd: BotnetDetector;

  beforeEach(() => {
    clock = new ManualBotClock();
    bd = new BotnetDetector({ windowMs: 60_000, minIps: 3 }, clock);
  });

  it('flags one fingerprint across many IPs', () => {
    clock.set(0);
    for (let i = 0; i < 6; i++) {
      bd.observe('fp-rare', `10.0.0.${i}`, i * 100); // perfectly regular
    }
    const c = bd.cluster('fp-rare', 0.0001);
    expect(c).toBeDefined();
    expect(c!.ips.length).toBe(6);
    expect(c!.score).toBeGreaterThan(0.6);
  });

  it('under-threshold IP count → no cluster', () => {
    bd.observe('fp', '1.1.1.1');
    bd.observe('fp', '2.2.2.2');
    expect(bd.cluster('fp')).toBeUndefined();
  });

  it('common fingerprints score lower than rare ones', () => {
    clock.set(0);
    for (let i = 0; i < 8; i++) bd.observe('fp-common', `1.1.1.${i}`, i * 50);
    for (let i = 0; i < 8; i++) bd.observe('fp-rare', `2.2.2.${i}`, i * 50);
    const common = bd.cluster('fp-common', 0.4)!;
    const rare = bd.cluster('fp-rare', 0.0001)!;
    expect(rare.score).toBeGreaterThan(common.score);
  });

  it('window trims old observations', () => {
    clock.set(0);
    for (let i = 0; i < 5; i++) bd.observe('fp', `1.1.1.${i}`, 0);
    clock.advance(120_000); // past 60s window
    for (let i = 0; i < 2; i++) bd.observe('fp', `2.2.2.${i}`, clock.now());
    // only 2 IPs remain in-window → under minIps=3 → undefined
    expect(bd.cluster('fp')).toBeUndefined();
  });

  it('suspiciousClusters lists all flagged fingerprints', () => {
    clock.set(0);
    for (let i = 0; i < 4; i++) bd.observe('a', `1.1.1.${i}`, i * 10);
    for (let i = 0; i < 4; i++) bd.observe('b', `2.2.2.${i}`, i * 10);
    bd.observe('c', '3.3.3.3');
    const cs = bd.suspiciousClusters();
    expect(cs.length).toBe(2);
  });
});
