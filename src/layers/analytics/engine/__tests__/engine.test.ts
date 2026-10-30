/**
 * Analytics Engine — unit tests.
 *
 * All timing is driven by `ManualAnalyticsClock`; events are built
 * with the `ev()` helper for compact scenarios.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  FunnelAnalyzer,
  CohortRetention,
  SessionStitcher,
  MetricRollup,
  ManualAnalyticsClock,
  bucketize,
  canonicalizeTags,
  AnalyticsEvent,
} from '../index';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

let seq = 0;
function ev(
  name: string,
  t: number,
  userId?: string,
  anonymousId?: string,
  properties?: Record<string, string | number | boolean>
): AnalyticsEvent {
  seq++;
  return { name, timestamp: t, userId, anonymousId, properties };
}

/* ------------------------------------------------------------------ */
/* FunnelAnalyzer — ordered                                             */
/* ------------------------------------------------------------------ */

describe('FunnelAnalyzer (ordered)', () => {
  let f: FunnelAnalyzer;
  beforeEach(() => {
    f = new FunnelAnalyzer(['view', 'cart', 'checkout', 'pay']);
  });

  it('counts a straightforward conversion', () => {
    f.addEvents([
      ev('view', 0, 'u1'),
      ev('cart', 10, 'u1'),
      ev('checkout', 20, 'u1'),
      ev('pay', 30, 'u1'),
    ]);
    const r = f.report();
    expect(r.entrants).toBe(1);
    expect(r.steps.map((s) => s.count)).toEqual([1, 1, 1, 1]);
    expect(r.steps[3].conversionFromStart).toBe(1);
  });

  it('requires step order — pay before checkout does not convert', () => {
    f.addEvents([
      ev('view', 0, 'u1'),
      ev('pay', 10, 'u1'), // out of order
      ev('cart', 20, 'u1'),
      ev('checkout', 30, 'u1'),
    ]);
    expect(f.depthOf('u1')).toBe(2); // view→cart→checkout; pay ignored
    const r = f.report();
    expect(r.steps[3].count).toBe(0);
  });

  it('ignores unrelated events between steps', () => {
    f.addEvents([
      ev('view', 0, 'u1'),
      ev('scroll', 5, 'u1'),
      ev('cart', 10, 'u1'),
      ev('ad_click', 15, 'u1'),
      ev('checkout', 20, 'u1'),
      ev('pay', 25, 'u1'),
    ]);
    expect(f.depthOf('u1')).toBe(3);
  });

  it('computes per-step conversion ratios', () => {
    for (const u of ['a', 'b', 'c', 'd']) f.addEvent(ev('view', 0, u));
    for (const u of ['a', 'b']) f.addEvent(ev('cart', 10, u));
    f.addEvent(ev('checkout', 20, 'a'));
    f.addEvent(ev('pay', 30, 'a'));
    const r = f.report();
    expect(r.entrants).toBe(4);
    expect(r.steps[1].conversionFromPrevious).toBe(0.5);
    expect(r.steps[2].conversionFromStart).toBe(0.25);
    expect(r.steps[2].droppedFromPrevious).toBe(1);
  });

  it('restarts funnel at a later step-0 event after window expiry', () => {
    const wf = new FunnelAnalyzer(['a', 'b'], { conversionWindowMs: 100 });
    wf.addEvents([
      ev('a', 0, 'u1'),
      // 'b' at 50 missing; window expires
      ev('a', 200, 'u1'),
      ev('b', 250, 'u1'), // inside the second window
    ]);
    expect(wf.depthOf('u1')).toBe(1);
  });

  it('fails conversion when steps land outside the window', () => {
    const wf = new FunnelAnalyzer(['a', 'b'], { conversionWindowMs: 100 });
    wf.addEvents([ev('a', 0, 'u1'), ev('b', 150, 'u1')]);
    expect(wf.depthOf('u1')).toBe(0);
  });

  it('handles out-of-order event delivery via sorted insert', () => {
    f.addEvents([
      ev('checkout', 30, 'u1'), // arrives first, timestamp later
      ev('view', 0, 'u1'),
      ev('cart', 10, 'u1'),
      ev('pay', 40, 'u1'),
    ]);
    expect(f.depthOf('u1')).toBe(3);
  });

  it('rejects degenerate funnels', () => {
    expect(() => new FunnelAnalyzer(['only'])).toThrow(RangeError);
    expect(() => new FunnelAnalyzer(['a', 'a'])).toThrow(RangeError);
  });
});

describe('FunnelAnalyzer (unordered)', () => {
  it('converts regardless of event order', () => {
    const f = new FunnelAnalyzer(['view', 'cart', 'pay'], { mode: 'unordered' });
    f.addEvents([
      ev('pay', 0, 'u1'),
      ev('view', 10, 'u1'),
      ev('cart', 20, 'u1'),
    ]);
    expect(f.depthOf('u1')).toBe(2);
  });

  it('stops at the first missing step in prefix semantics', () => {
    const f = new FunnelAnalyzer(['view', 'cart', 'pay'], { mode: 'unordered' });
    // has view + pay but no cart → depth 0 only
    f.addEvents([ev('view', 0, 'u1'), ev('pay', 10, 'u1')]);
    expect(f.depthOf('u1')).toBe(0);
  });

  it('enforces window across the earliest→latest first-seen span', () => {
    const f = new FunnelAnalyzer(['a', 'b', 'c'], {
      mode: 'unordered',
      conversionWindowMs: 100,
    });
    f.addEvents([ev('a', 0, 'u1'), ev('b', 50, 'u1'), ev('c', 300, 'u1')]);
    // span a→c = 300 > 100 → fails at step 2
    expect(f.depthOf('u1')).toBe(1);
  });
});

describe('FunnelAnalyzer drop-off attribution', () => {
  it('surfaces over-represented property values among dropped users', () => {
    const f = new FunnelAnalyzer(['view', 'buy']);
    // 'ie' users all drop; 'chrome' users all continue
    for (const u of ['d1', 'd2', 'd3']) {
      f.addEvent(ev('view', 0, u, undefined, { browser: 'ie' }));
    }
    for (const u of ['c1', 'c2']) {
      f.addEvent(ev('view', 0, u, undefined, { browser: 'chrome' }));
      f.addEvent(ev('buy', 10, u, undefined, { browser: 'chrome' }));
    }
    const r = f.report(['browser']);
    expect(r.attributions.length).toBeGreaterThan(0);
    const top = r.attributions[0];
    expect(top.step).toBe(1);
    expect(top.property).toBe('browser');
    expect(top.value).toBe('ie');
    expect(top.droppedShare).toBe(1);
    expect(top.continuedShare).toBe(0);
    expect(top.lift).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* CohortRetention                                                      */
/* ------------------------------------------------------------------ */

describe('CohortRetention', () => {
  let clock: ManualAnalyticsClock;
  let cr: CohortRetention;

  beforeEach(() => {
    clock = new ManualAnalyticsClock();
    cr = new CohortRetention({ periodMs: WEEK, periods: 4 }, clock);
  });

  it('puts users in cohorts by first event week', () => {
    clock.set(3 * WEEK);
    cr.addEvents([
      ev('signup', 0, 'u1'),
      ev('signup', 2 * DAY, 'u2'), // same week
      ev('signup', 8 * DAY, 'u3'), // next week
    ]);
    const r = cr.report();
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].cohortSize).toBe(2);
    expect(r.rows[1].cohortSize).toBe(1);
  });

  it('reports retained fraction per period', () => {
    clock.set(3 * WEEK);
    cr.addEvents([
      ev('signup', 0, 'u1'),
      ev('login', WEEK + 1, 'u1'), // retained p1
      ev('signup', 0, 'u2'),
      // u2 never returns
    ]);
    const r = cr.report();
    const row = r.rows[0];
    expect(row.cells[0].retained).toBe(1);
    expect(row.cells[1].active).toBe(1);
    expect(row.cells[1].retained).toBe(0.5);
    expect(row.cells[2].retained).toBe(0);
  });

  it('truncates cells at now — no future periods', () => {
    clock.set(WEEK + DAY);
    cr.addEvent(ev('signup', 0, 'u1'));
    const r = cr.report();
    // periods starting at 0 and WEEK are ≤ now; 2·WEEK is future
    expect(r.rows[0].cells.length).toBe(2);
  });

  it('respects activityEvents filter', () => {
    clock.set(2 * WEEK);
    const filtered = new CohortRetention(
      { periodMs: WEEK, activityEvents: ['login'] },
      clock
    );
    filtered.addEvents([
      ev('signup', 0, 'u1'), // not an activity event → not tracked
    ]);
    expect(filtered.userCount).toBe(0);
    filtered.addEvents([
      ev('login', 0, 'u1'),
      ev('page_view', WEEK + 1, 'u1'), // ignored
      ev('login', WEEK + 2, 'u1'),
    ]);
    const row = filtered.report().rows[0];
    expect(row.cells[1].retained).toBe(1);
  });

  it('retentionAt looks up single cells', () => {
    clock.set(3 * WEEK);
    cr.addEvents([ev('s', 0, 'u1'), ev('s', WEEK + 1, 'u1')]);
    expect(cr.retentionAt(0, 1)).toBe(1);
    expect(cr.retentionAt(0, 2)).toBe(0);
    expect(cr.retentionAt(123, 0)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* SessionStitcher                                                      */
/* ------------------------------------------------------------------ */

describe('SessionStitcher', () => {
  let clock: ManualAnalyticsClock;
  let s: SessionStitcher;

  beforeEach(() => {
    clock = new ManualAnalyticsClock();
    s = new SessionStitcher({ sessionGapMs: 60_000, clock });
  });

  it('splits sessions on the inactivity gap', () => {
    s.track(ev('pv', 0, undefined, 'anon1'));
    s.track(ev('pv', 30_000, undefined, 'anon1'));
    s.track(ev('pv', 200_000, undefined, 'anon1')); // gap > 60s → new
    const sessions = s.sessionsOf('anon1');
    expect(sessions.length).toBe(2);
    expect(sessions[0].eventCount).toBe(2);
    expect(sessions[1].eventCount).toBe(1);
  });

  it('reattributes anonymous history on identify', () => {
    s.track(ev('pv', 0, undefined, 'anon1'));
    s.track(ev('pv', 10_000, undefined, 'anon1'));
    const rep = s.identify('anon1', 'u1');
    expect(rep.reattributedEvents).toBe(2);
    expect(rep.mergedSessions).toBe(1);
    expect(s.eventsOf('u1').length).toBe(2);
    expect(s.eventsOf('anon1').length).toBe(0);
  });

  it('routes future anonymous events to the user', () => {
    s.track(ev('pv', 0, undefined, 'a'));
    s.identify('a', 'u1');
    s.track(ev('pv', 30_000, undefined, 'a'));
    expect(s.eventsOf('u1').length).toBe(2);
    // Same session — gap didn't reset
    expect(s.sessionsOf('u1').length).toBe(1);
  });

  it('merges timelines in timestamp order', () => {
    s.track(ev('login', 5_000, 'u1'));
    s.track(ev('pv', 0, undefined, 'a'));
    s.track(ev('pv', 10_000, undefined, 'a'));
    s.identify('a', 'u1');
    const names = s.eventsOf('u1').map((e) => e.name);
    expect(names).toEqual(['pv', 'login', 'pv']);
  });

  it('identity reports anonymous lineage', () => {
    s.track(ev('pv', 0, undefined, 'a1'));
    s.track(ev('pv', 0, undefined, 'a2'));
    s.identify('a1', 'u1');
    s.identify('a2', 'u1');
    const id = s.identity('u1');
    expect(id).toBeDefined();
    expect(id!.anonymousIds.sort()).toEqual(['a1', 'a2']);
    expect(id!.eventCount).toBe(2);
  });

  it('is idempotent on repeated identify', () => {
    s.track(ev('pv', 0, undefined, 'a'));
    s.identify('a', 'u1');
    const rep2 = s.identify('a', 'u1');
    expect(rep2.reattributedEvents).toBe(0);
    expect(s.eventsOf('u1').length).toBe(1);
  });

  it('reset severs the alias for future events', () => {
    s.identify('a', 'u1');
    s.reset('a');
    s.track(ev('pv', 0, undefined, 'a'));
    expect(s.eventsOf('u1').length).toBe(0);
    expect(s.eventsOf('a').length).toBe(1);
  });

  it('explicit sessionIds are honored', () => {
    s.track(ev('pv', 0, undefined, 'a', undefined));
    s.track({ name: 'pv', timestamp: 1_000, anonymousId: 'a', sessionId: 'sess-9' });
    // Second event has explicit session id → attaches to that session
    expect(s.sessionsOf('a')[0].eventCount).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* MetricRollup                                                         */
/* ------------------------------------------------------------------ */

describe('MetricRollup', () => {
  let r: MetricRollup;
  beforeEach(() => {
    r = new MetricRollup();
  });

  it('aggregates count/sum/min/max/mean into hour buckets', () => {
    const h0 = bucketize(0, 'hour');
    r.addAll([
      { metric: 'rev', value: 10, timestamp: 0 },
      { metric: 'rev', value: 20, timestamp: 1000 },
      { metric: 'rev', value: 5, timestamp: 3_600_000 }, // next hour
    ]);
    const buckets = r.query({ metric: 'rev', grain: 'hour' });
    expect(buckets.length).toBe(2);
    const c = buckets[0].cell;
    expect(c.count).toBe(2);
    expect(c.sum).toBe(30);
    expect(c.min).toBe(10);
    expect(c.max).toBe(20);
    expect(c.mean).toBe(15);
    expect(buckets[0].bucketStart).toBe(h0);
  });

  it('maintains a day-grain rollup in parallel', () => {
    r.add({ metric: 'm', value: 1, timestamp: 0 });
    r.add({ metric: 'm', value: 2, timestamp: 23 * 3_600_000 });
    const day = r.query({ metric: 'm', grain: 'day' });
    expect(day.length).toBe(1);
    expect(day[0].cell.sum).toBe(3);
    expect(r.query({ metric: 'm', grain: 'hour' }).length).toBe(2);
  });

  it('slices by tags and keeps a wildcard cell', () => {
    r.add({ metric: 'rev', value: 10, timestamp: 0, tags: { country: 'us' } });
    r.add({ metric: 'rev', value: 20, timestamp: 0, tags: { country: 'de' } });
    r.add({ metric: 'rev', value: 5, timestamp: 0 });
    const us = r.query({ metric: 'rev', grain: 'hour', tags: { country: 'us' } });
    expect(us.length).toBe(1);
    expect(us[0].cell.sum).toBe(10);
    // wildcard cell carries all three points
    expect(r.total('rev', 'hour')).toBe(35);
  });

  it('tag superset matching rolls up across unfiltered dimensions', () => {
    r.add({
      metric: 'rev',
      value: 7,
      timestamp: 0,
      tags: { country: 'us', plan: 'pro' },
    });
    const us = r.query({ metric: 'rev', grain: 'hour', tags: { country: 'us' } });
    expect(us.some((b) => b.cell.sum === 7)).toBe(true);
  });

  it('canonicalizes tag order', () => {
    expect(canonicalizeTags({ b: '2', a: '1' })).toBe('a=1&b=2');
    r.add({ metric: 'm', value: 1, timestamp: 0, tags: { a: '1', b: '2' } });
    r.add({ metric: 'm', value: 1, timestamp: 0, tags: { b: '2', a: '1' } });
    const cells = r.query({ metric: 'm', grain: 'hour', tags: { a: '1' } });
    expect(cells.length).toBe(1);
    expect(cells[0].cell.count).toBe(2);
  });

  it('filters by time range', () => {
    for (let h = 0; h < 5; h++) {
      r.add({ metric: 'm', value: h, timestamp: h * 3_600_000 });
    }
    const buckets = r.query({
      metric: 'm',
      grain: 'hour',
      from: 3_600_000,
      to: 3 * 3_600_000,
    });
    expect(buckets.length).toBe(3);
  });

  it('rejects non-finite values', () => {
    expect(() =>
      r.add({ metric: 'm', value: Number.NaN, timestamp: 0 })
    ).toThrow(RangeError);
  });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

describe('helpers', () => {
  it('bucketize floors to grain', () => {
    expect(bucketize(3_700_000, 'hour')).toBe(3_600_000);
    expect(bucketize(26 * 3_600_000, 'day')).toBe(86_400_000);
  });
});
