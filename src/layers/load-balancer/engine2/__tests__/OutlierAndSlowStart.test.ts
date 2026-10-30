/**
 * Tests for OutlierDetector and SlowStart.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { OutlierDetector } from '../OutlierDetector';
import { SlowStart } from '../SlowStart';
import { ManualLbClock2, Backend2 } from '../types';

const bk = (id: string, w = 100): Backend2 => ({ id, baseWeight: w });

describe('OutlierDetector', () => {
  let clock: ManualLbClock2;
  let det: OutlierDetector;

  beforeEach(() => {
    clock = new ManualLbClock2(10_000);
    det = new OutlierDetector({
      consecutiveFailureThreshold: 3,
      baseEjectMs: 1_000,
      maxEjectMs: 10_000,
      clock,
    });
    det.track(bk('b1'));
  });

  it('ejects after threshold consecutive failures', () => {
    expect(det.reportFailure('b1')).toBe('none');
    expect(det.reportFailure('b1')).toBe('none');
    expect(det.reportFailure('b1')).toBe('threshold');
    expect(det.isEjected('b1')).toBe(true);
  });

  it('a success resets the consecutive counter', () => {
    det.reportFailure('b1');
    det.reportFailure('b1');
    det.reportSuccess('b1');
    det.reportFailure('b1');
    det.reportFailure('b1');
    expect(det.isEjected('b1')).toBe(false);
    expect(det.reportFailure('b1')).toBe('threshold');
  });

  it('ejection expires with time', () => {
    for (let i = 0; i < 3; i++) det.reportFailure('b1');
    expect(det.isEjected('b1')).toBe(true);
    clock.advance(999);
    expect(det.isEjected('b1')).toBe(true);
    clock.advance(1);
    expect(det.isEjected('b1')).toBe(false);
    expect(det.takeRecoveryEligible('b1')).toBe(true);
    expect(det.takeRecoveryEligible('b1')).toBe(false); // consumed
  });

  it('applies exponential backoff on repeat ejections', () => {
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) det.reportFailure('b1');
      const until = det.ejectedUntil('b1');
      const expected = Math.min(1_000 * 2 ** round, 10_000);
      expect(until).toBe(clock.now() + expected);
      clock.advance(expected);
      det.takeRecoveryEligible('b1');
    }
    expect(det.ejectionCount('b1')).toBe(3);
  });

  it('quarantines after maxEjections', () => {
    const d = new OutlierDetector({
      consecutiveFailureThreshold: 1,
      baseEjectMs: 100,
      maxEjections: 2,
      clock,
    });
    d.track(bk('x'));
    d.reportFailure('x');
    clock.advance(100);
    d.takeRecoveryEligible('x');
    d.reportFailure('x');
    clock.advance(200);
    d.takeRecoveryEligible('x');
    d.reportFailure('x'); // 3rd ejection > max 2 → quarantine
    expect(d.isEjected('x')).toBe(true);
    expect(d.ejectedUntil('x')).toBe(Number.POSITIVE_INFINITY);
    clock.advance(1_000_000);
    expect(d.isEjected('x')).toBe(true);
    d.unquarantine('x');
    expect(d.isEjected('x')).toBe(false);
  });

  it('does not eject on non-consecutive failures', () => {
    det.reportFailure('b1');
    det.reportSuccess('b1');
    det.reportFailure('b1');
    det.reportSuccess('b1');
    det.reportFailure('b1');
    expect(det.isEjected('b1')).toBe(false);
  });

  it('manual eject/unquarantine works', () => {
    det.eject('b1', 500);
    expect(det.isEjected('b1')).toBe(true);
    det.unquarantine('b1');
    expect(det.isEjected('b1')).toBe(false);
  });

  it('tracks success rate', () => {
    det.reportSuccess('b1');
    det.reportSuccess('b1');
    det.reportFailure('b1');
    expect(det.successRate('b1')).toBeCloseTo(2 / 3);
  });
});

describe('SlowStart', () => {
  let clock: ManualLbClock2;
  let ss: SlowStart;

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    ss = new SlowStart({ windowMs: 1_000, minWeightPercent: 0.1, clock });
  });

  it('ramps weight from minPct to 100% over the window', () => {
    const b = bk('b', 100);
    ss.startRamp('b');
    expect(ss.effectiveWeight(b)).toBe(10); // t=0 → 10%
    clock.advance(500);
    expect(ss.effectiveWeight(b)).toBe(55); // 10 + 90*0.5
    clock.advance(500);
    expect(ss.effectiveWeight(b)).toBe(100); // done
    expect(ss.isRamping('b')).toBe(false);
  });

  it('ease-in stays conservative early', () => {
    const b = bk('b', 100);
    const ez = new SlowStart({ windowMs: 1_000, minWeightPercent: 0.1, shape: 'ease-in', clock });
    ez.startRamp('b');
    clock.advance(500);
    // t² = 0.25 → 10 + 90*0.25 = 32 vs linear's 55
    expect(ez.effectiveWeight(b)).toBe(32);
  });

  it('non-ramping backends get full weight', () => {
    expect(ss.effectiveWeight(bk('b', 40))).toBe(40);
  });

  it('weight never drops below 1', () => {
    const tiny = bk('tiny', 2);
    ss.startRamp('tiny');
    expect(ss.effectiveWeight(tiny)).toBe(1);
  });

  it('finishRamp restores full weight immediately', () => {
    const b = bk('b', 80);
    ss.startRamp('b');
    ss.finishRamp('b');
    expect(ss.effectiveWeight(b)).toBe(80);
  });

  it('remainingMs counts down', () => {
    ss.startRamp('b');
    clock.advance(300);
    expect(ss.remainingMs('b')).toBe(700);
  });
});
