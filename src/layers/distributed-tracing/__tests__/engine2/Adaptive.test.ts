/**
 * engine2 AdaptiveSampler tests.
 */

import { describe, it, expect } from 'bun:test';
import { ManualClock } from '../../../observability/engine';
import { AdaptiveSampler } from '../../engine2';

describe('AdaptiveSampler', () => {
  it('admits up to the token-bucket allowance', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({ minTracesPerSecond: 2 }, clock);
    expect(s.shouldSample('op')).toBe(true);
    expect(s.shouldSample('op')).toBe(true);
    expect(s.shouldSample('op')).toBe(false); // empty
  });

  it('refills tokens over time', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({ minTracesPerSecond: 10 }, clock);
    s.shouldSample('op'); // spend 1
    clock.advance(1_000); // +10 tokens (capped at 20)
    let admitted = 0;
    for (let i = 0; i < 25; i++) if (s.shouldSample('op')) admitted += 1;
    expect(admitted).toBeGreaterThanOrEqual(9);
  });

  it('starved ops grow their allowance on evaluate() (AIMD increase)', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({
      minTracesPerSecond: 1,
      increasePerSecond: 0.5,
      maxTracesPerSecond: 10,
    }, clock);
    s.shouldSample('op'); // admit
    s.shouldSample('op'); // starve
    clock.advance(1_000);
    s.evaluate();
    expect(s.allowanceOf('op')).toBeCloseTo(1.5, 9);
  });

  it('un-starved ops decay toward the floor on evaluate()', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({
      minTracesPerSecond: 1,
      decayPerSecond: 0.5,
      increasePerSecond: 1,
      maxTracesPerSecond: 100,
    }, clock);
    // Push allowance up via starvation + evaluations.
    for (let i = 0; i < 4; i++) {
      // Drain the bucket then starve once more.
      while (s.shouldSample('op')) { /* drain */ }
      clock.advance(1_000);
      s.evaluate();
    }
    const hi = s.allowanceOf('op');
    expect(hi).toBeGreaterThan(1);
    // Now keep it fed (no starving calls) — decay toward the floor.
    for (let i = 0; i < 6; i++) {
      clock.advance(1_000);
      s.evaluate();
    }
    expect(s.allowanceOf('op')).toBeLessThan(hi);
    expect(s.allowanceOf('op')).toBeGreaterThanOrEqual(1);
  });

  it('ops are independent', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({ minTracesPerSecond: 1 }, clock);
    expect(s.shouldSample('a')).toBe(true);
    expect(s.shouldSample('a')).toBe(false);
    expect(s.shouldSample('b')).toBe(true);
  });

  it('stats expose admitted/dropped per op', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({ minTracesPerSecond: 1 }, clock);
    s.shouldSample('x');
    s.shouldSample('x');
    const st = s.stats().find((r) => r.operation === 'x')!;
    expect(st.admitted).toBe(1);
    expect(st.dropped).toBe(1);
  });

  it('evaluate is rate-limited to once per second per op', () => {
    const clock = new ManualClock(0);
    const s = new AdaptiveSampler({ minTracesPerSecond: 1, increasePerSecond: 1 }, clock);
    s.shouldSample('op');
    s.shouldSample('op'); // starve
    s.evaluate(); // too soon — no adapt
    expect(s.allowanceOf('op')).toBe(1);
    clock.advance(1_000);
    s.evaluate();
    s.evaluate(); // second call same tick — no double bump
    expect(s.allowanceOf('op')).toBe(2);
  });
});
