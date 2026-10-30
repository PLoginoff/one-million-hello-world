/**
 * Tests for EwmaHealthScore — percentage-based outlier detection.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EwmaHealthScore } from '../EwmaHealthScore';
import { ManualLbClock2 } from '../types';

describe('EwmaHealthScore', () => {
  let clock: ManualLbClock2;
  let ewma: EwmaHealthScore;

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    ewma = new EwmaHealthScore({
      halflifeMs: 1_000,
      minSuccessRate: 0.7,
      minSamples: 5,
      clock,
    });
  });

  it('starts healthy with no evidence', () => {
    expect(ewma.isHealthy('b')).toBe(true);
    expect(ewma.score('b')).toBe(1);
  });

  it('needs minSamples before judging', () => {
    ewma.observe('b', false);
    ewma.observe('b', false);
    expect(ewma.score('b')).toBe(0);
    expect(ewma.isHealthy('b')).toBe(true); // only 2 samples
  });

  it('flags a backend that mostly fails', () => {
    for (let i = 0; i < 10; i++) ewma.observe('b', i % 4 === 0); // 30% success
    expect(ewma.score('b')).toBeLessThan(0.7);
    expect(ewma.isHealthy('b')).toBe(false);
    expect(ewma.unhealthy()).toEqual(['b']);
  });

  it('stays healthy for a mostly-good backend', () => {
    for (let i = 0; i < 20; i++) ewma.observe('b', i % 10 !== 0); // 90% ok
    expect(ewma.isHealthy('b')).toBe(true);
  });

  it('recovers as fresh successes outweigh stale failures', () => {
    for (let i = 0; i < 10; i++) ewma.observe('b', false);
    expect(ewma.isHealthy('b')).toBe(false);
    // Wait several half-lives so the bad evidence decays…
    clock.advance(10_000);
    // …then feed successes — each new sample dominates.
    for (let i = 0; i < 10; i++) {
      ewma.observe('b', true);
      clock.advance(10);
    }
    expect(ewma.isHealthy('b')).toBe(true);
  });

  it('idle time shrinks evidence weight', () => {
    for (let i = 0; i < 8; i++) ewma.observe('b', true);
    const before = ewma.sampleWeight('b');
    clock.advance(2_000); // 2 half-lives → quarter weight
    expect(ewma.sampleWeight('b')).toBeLessThan(before / 3);
  });

  it('score is ratio-stable under pure idleness', () => {
    ewma.observe('b', true);
    ewma.observe('b', false);
    const s1 = ewma.score('b');
    clock.advance(5_000);
    expect(ewma.score('b')).toBeCloseTo(s1);
  });

  it('reset clears evidence', () => {
    for (let i = 0; i < 10; i++) ewma.observe('b', false);
    ewma.reset('b');
    expect(ewma.isHealthy('b')).toBe(true);
    expect(ewma.sampleWeight('b')).toBe(0);
  });
});
