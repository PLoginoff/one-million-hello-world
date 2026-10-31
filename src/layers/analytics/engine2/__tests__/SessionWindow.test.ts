/**
 * Tests for SessionWindowGrouper: gap-timeout segmentation,
 * out-of-order events, per-session and aggregate stats.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SessionWindowGrouper } from '../SessionWindowGrouper';
import { ManualAnalyticsClock2 } from '../types';

const MIN = 60_000;

describe('SessionWindowGrouper', () => {
  let clock: ManualAnalyticsClock2;
  let g: SessionWindowGrouper;

  beforeEach(() => {
    clock = new ManualAnalyticsClock2(0);
    g = new SessionWindowGrouper({ gapMs: 30 * MIN, clock });
  });

  it('groups events within the gap into one session', () => {
    g.track('u', 'view', 0);
    g.track('u', 'click', 10 * MIN);
    g.track('u', 'view', 20 * MIN);
    const s = g.sessions('u');
    expect(s.length).toBe(1);
    expect(s[0]!.eventCount).toBe(3);
    expect(s[0]!.durationMs).toBe(20 * MIN);
    expect(s[0]!.bounce).toBe(false);
    expect(s[0]!.eventNames).toEqual({ view: 2, click: 1 });
  });

  it('splits on gaps larger than gapMs', () => {
    g.track('u', 'a', 0);
    g.track('u', 'b', 10 * MIN);
    g.track('u', 'c', 60 * MIN); // 50-min gap → new session
    const s = g.sessions('u');
    expect(s.length).toBe(2);
    expect(s[0]!.eventCount).toBe(2);
    expect(s[1]!.eventCount).toBe(1);
    expect(s[1]!.bounce).toBe(true);
  });

  it('gap exactly at boundary stays in the same session', () => {
    g.track('u', 'a', 0);
    g.track('u', 'b', 30 * MIN); // == gapMs, not >
    const s = g.sessions('u');
    expect(s.length).toBe(1);
  });

  it('out-of-order events re-segment correctly', () => {
    g.track('u', 'a', 0);
    g.track('u', 'c', 60 * MIN);
    g.track('u', 'b', 10 * MIN); // late arrival fills the gap
    const s = g.sessions('u');
    // 0 and 10min are one session; 60min is still separate (50-min gap)
    expect(s.length).toBe(2);
    expect(s[0]!.eventCount).toBe(2);
    expect(s[0]!.endedAt).toBe(10 * MIN);
  });

  it('eventsPerMinute is count for instant sessions', () => {
    g.track('u', 'a', 0);
    const s = g.sessions('u');
    expect(s[0]!.eventsPerMinute).toBe(1);
  });

  it('isActive reflects recency vs the gap', () => {
    g.track('u', 'a', 0);
    clock.set(10 * MIN);
    expect(g.isActive('u')).toBe(true);
    clock.set(31 * MIN);
    expect(g.isActive('u')).toBe(false);
    expect(g.isActive('ghost')).toBe(false);
  });

  it('stats aggregate sessions per subject', () => {
    g.track('u', 'a', 0);
    g.track('u', 'b', 10 * MIN); // session 1: 10 min, 2 events
    g.track('u', 'c', 100 * MIN); // session 2: bounce
    const st = g.stats('u')!;
    expect(st.sessions).toBe(2);
    expect(st.totalEvents).toBe(3);
    expect(st.meanEventsPerSession).toBe(1.5);
    expect(st.bounceRate).toBe(0.5);
    expect(st.medianDurationMs).toBe(5 * MIN);
    expect(st.meanDurationMs).toBe(5 * MIN);
  });

  it('median of even-length duration list averages the middles', () => {
    // sessions at 0..10 (10min), 100 (0), 200..220 (20min), 400 (0)
    g.track('u', 'a', 0);
    g.track('u', 'b', 10 * MIN);
    g.track('u', 'c', 100 * MIN);
    g.track('u', 'd', 200 * MIN);
    g.track('u', 'e', 220 * MIN);
    g.track('u', 'f', 400 * MIN);
    const st = g.stats('u')!;
    const durations = [0, 0, 10 * MIN, 20 * MIN];
    expect(st.medianDurationMs).toBe((durations[1]! + durations[2]!) / 2);
  });

  it('globalStats spans subjects', () => {
    g.track('a', 'x', 0);
    g.track('a', 'x', 100 * MIN); // 2 sessions for a
    g.track('b', 'y', 0);
    g.track('b', 'y', 5 * MIN); // 1 session for b
    const s = g.globalStats()!;
    expect(s.sessions).toBe(3);
    expect(s.totalEvents).toBe(4);
    expect(s.bounceRate).toBeCloseTo(2 / 3, 6);
  });

  it('unknown subjects yield undefined stats and empty sessions', () => {
    expect(g.sessions('ghost')).toEqual([]);
    expect(g.stats('ghost')).toBeUndefined();
    expect(g.globalStats()).toBeUndefined();
  });

  it('forget removes buffered events', () => {
    g.track('u', 'a', 0);
    expect(g.forget('u')).toBe(true);
    expect(g.sessions('u')).toEqual([]);
    expect(g.forget('u')).toBe(false);
    expect(g.subjectIds()).toEqual([]);
  });

  it('rejects non-positive gapMs', () => {
    expect(() => new SessionWindowGrouper({ gapMs: 0 })).toThrow();
    expect(() => new SessionWindowGrouper({ gapMs: -5 })).toThrow();
  });
});
