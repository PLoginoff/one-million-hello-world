/**
 * Tests for TrafficShiftModeler: normal CDF approximation, z-test
 * p-values, sequential LLR decisions and Welch t-tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TrafficShiftModeler, normalCdf, zToP } from '../TrafficShiftModeler';

describe('normalCdf / zToP', () => {
  it('matches known normal quantiles', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 2); // AS approx error bound
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 2);
    expect(normalCdf(3)).toBeCloseTo(0.99865, 3);
  });

  it('zToP gives two-tailed p-values', () => {
    expect(zToP(0)).toBeCloseTo(1, 6);
    expect(zToP(1.96)).toBeCloseTo(0.05, 2);
    expect(zToP(2.58)).toBeCloseTo(0.01, 2);
  });
});

describe('TrafficShiftModeler — binomial arms', () => {
  let m: TrafficShiftModeler;

  beforeEach(() => {
    m = new TrafficShiftModeler({ alpha: 0.05, beta: 0.2, mdeRelative: 0.2 });
  });

  const pump = (n: number, pControl: number, pTreatment: number) => {
    for (let i = 0; i < n; i++) {
      m.observeControl(i % Math.round(1 / pControl) === 0);
      m.observeTreatment(i % Math.round(1 / pTreatment) === 0);
    }
  };

  it('identical arms stay at continue or drop, never lift', () => {
    pump(200, 0.1, 0.1);
    const s = m.status();
    expect(s.verdict).not.toBe('lift');
    expect(s.relativeLift).toBeCloseTo(0, 6);
    expect(s.naivePValue).toBeCloseTo(1, 6);
  });

  it('a real lift eventually crosses the upper Wald bound', () => {
    // 10% control vs 20% treatment, MDE 0.2 → detectable.
    pump(500, 0.1, 0.2);
    const s = m.status();
    expect(s.verdict).toBe('lift');
    expect(s.llr).toBeGreaterThanOrEqual(s.upperBound);
    expect(s.relativeLift).toBeCloseTo(1, 1);
  });

  it('verdict harm when treatment underperforms', () => {
    const m2 = new TrafficShiftModeler({ alpha: 0.05, beta: 0.2, mdeRelative: -0.2 });
    // p1 = p0*(1-0.2): LLR grows when treatment < control.
    for (let i = 0; i < 500; i++) {
      m2.observeControl(i % 5 === 0); // 20%
      m2.observeTreatment(i % 10 === 0); // 10%
    }
    const s = m2.status();
    expect(s.verdict).toBe('harm');
  });

  it('empty status is all NaN/zero gracefully', () => {
    const s = m.status();
    expect(s.controlN).toBe(0);
    expect(s.treatmentRate).toBe(0);
    expect(s.naivePValue).toBeNaN();
    expect(s.verdict).toBe('continue');
  });

  it('zTestPValue is small for a clear difference', () => {
    pump(400, 0.1, 0.2);
    expect(m.zTestPValue()).toBeLessThan(0.001);
  });

  it('bounds derive from alpha/beta', () => {
    const s = m.status();
    expect(s.upperBound).toBeCloseTo(Math.log(0.8 / 0.05), 6);
    expect(s.lowerBound).toBeCloseTo(Math.log(0.2 / 0.95), 6);
  });

  it('rejects invalid alpha/beta', () => {
    expect(() => new TrafficShiftModeler({ alpha: 0 })).toThrow();
    expect(() => new TrafficShiftModeler({ alpha: 1.5 })).toThrow();
    expect(() => new TrafficShiftModeler({ beta: 0 })).toThrow();
  });
});

describe('TrafficShiftModeler — continuous arms', () => {
  it('Welch t-test detects a mean shift', () => {
    const m = new TrafficShiftModeler();
    for (let i = 0; i < 200; i++) {
      m.observeControlValue(100 + (i % 10)); // mean ~104.5
      m.observeTreatmentValue(110 + (i % 10)); // mean ~114.5
    }
    expect(m.welchPValue()).toBeLessThan(0.001);
    const means = m.means();
    expect(means.treatment - means.control).toBeCloseTo(10, 1);
  });

  it('Welch is NaN with fewer than 2 samples per arm', () => {
    const m = new TrafficShiftModeler();
    m.observeControlValue(1);
    expect(m.welchPValue()).toBeNaN();
    m.observeTreatmentValue(2);
    m.observeTreatmentValue(3);
    expect(m.welchPValue()).toBeNaN(); // control needs 2
  });

  it('identical distributions give a high p-value', () => {
    const m = new TrafficShiftModeler();
    for (let i = 0; i < 100; i++) {
      const v = 50 + (i % 7);
      m.observeControlValue(v);
      m.observeTreatmentValue(v);
    }
    expect(m.welchPValue()).toBeCloseTo(1, 6);
  });

  it('sizes() reports both arms', () => {
    const m = new TrafficShiftModeler();
    m.observeControl(true);
    m.observeTreatment(false);
    m.observeTreatment(true);
    expect(m.sizes()).toEqual({ control: 1, treatment: 2 });
  });
});
