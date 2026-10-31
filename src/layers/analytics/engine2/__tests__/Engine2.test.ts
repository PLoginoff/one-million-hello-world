/**
 * Tests for SlidingWindowAggregator, EventTracker, AttributionModeler
 * and DashboardComposer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SlidingWindowAggregator } from '../SlidingWindowAggregator';
import { EventTracker, SequenceRandomSource } from '../EventTracker';
import { AttributionModeler } from '../AttributionModeler';
import { DashboardComposer } from '../DashboardComposer';
import { ManualAnalyticsClock2, EventSchema } from '../types';

describe('SlidingWindowAggregator — counters', () => {
  let clock: ManualAnalyticsClock2;
  let agg: SlidingWindowAggregator;

  beforeEach(() => {
    clock = new ManualAnalyticsClock2(0);
    agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 10_000, clock });
  });

  it('counts points inside the window', () => {
    agg.record({ metric: 'hits', timestamp: 500 });
    agg.record({ metric: 'hits', timestamp: 1_500 });
    agg.record({ metric: 'hits', timestamp: 9_999 });
    const a = agg.aggregate('hits', 'count', 10_000);
    expect(a.value).toBe(3);
    expect(a.samples).toBe(3);
  });

  it('excludes points older than the window', () => {
    agg.record({ metric: 'hits', timestamp: 0 });
    clock.set(30_000);
    agg.record({ metric: 'hits' });
    const a = agg.aggregate('hits', 'count', 30_001);
    expect(a.value).toBe(1);
  });

  it('computes sum/avg/min/max', () => {
    for (const v of [10, 20, 30]) {
      agg.record({ metric: 'latency', value: v, timestamp: 5_000 });
    }
    expect(agg.aggregate('latency', 'sum', 10_000).value).toBe(60);
    expect(agg.aggregate('latency', 'avg', 10_000).value).toBe(20);
    expect(agg.aggregate('latency', 'min', 10_000).value).toBe(10);
    expect(agg.aggregate('latency', 'max', 10_000).value).toBe(30);
  });

  it('returns NaN for avg/min/max with no samples', () => {
    expect(agg.aggregate('nope', 'avg', 1_000).value).toBeNaN();
    expect(agg.aggregate('nope', 'min', 1_000).value).toBeNaN();
    expect(agg.aggregate('nope', 'count', 1_000).value).toBe(0);
  });

  it('reuses stale bucket cells after wrap-around', () => {
    // slots = 11; write at t=0 then advance far past window so the
    // same physical cell is reused with a new generation index.
    agg.record({ metric: 'm', timestamp: 0 });
    agg.record({ metric: 'm', timestamp: 22_000 }); // absIndex 22 -> slot 0
    const a = agg.aggregate('m', 'count', 32_000);
    expect(a.value).toBe(1); // only the newest point is in-window
  });

  it('tracks metrics independently', () => {
    agg.record({ metric: 'a', timestamp: 100 });
    agg.record({ metric: 'b', value: 5, timestamp: 100 });
    expect(agg.aggregate('a', 'count', 1_000).value).toBe(1);
    expect(agg.aggregate('b', 'sum', 1_000).value).toBe(5);
  });

  it('rejects invalid options', () => {
    expect(() => new SlidingWindowAggregator({ bucketMs: 0, windowMs: 1 })).toThrow();
    expect(() => new SlidingWindowAggregator({ bucketMs: 10, windowMs: 5 })).toThrow();
  });
});

describe('SlidingWindowAggregator — sparklines', () => {
  it('produces bucketed series with null gaps', () => {
    const clock = new ManualAnalyticsClock2(10_000);
    const agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 60_000, clock });
    agg.record({ metric: 'm', timestamp: 7_500 }); // bucket 7
    agg.record({ metric: 'm', timestamp: 7_800 });
    agg.record({ metric: 'm', value: 4, timestamp: 9_200 }); // bucket 9

    const s = agg.sparkline('m', 'count', 5, 10_000);
    expect(s.buckets.length).toBe(5);
    // buckets 5..9: [null, null, 2, null, 1]
    expect(s.buckets.map((b) => b.value)).toEqual([null, null, 2, null, 1]);
    expect(s.buckets[4]!.start).toBe(9_000);
  });

  it('sparkline of unknown metric is all null', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    const s = agg.sparkline('ghost', 'sum', 3, 500);
    expect(s.buckets.every((b) => b.value === null)).toBe(true);
  });
});

describe('SlidingWindowAggregator — topN', () => {
  it('ranks dimensions by count desc then key asc', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    for (const k of ['b', 'a', 'b', 'c', 'a', 'b']) agg.hit('pages', k);
    const t = agg.topN('pages', 2);
    expect(t.entries[0]).toEqual({ key: 'b', count: 3, share: 0.5 });
    expect(t.entries[1]!.key).toBe('a');
    expect(t.total).toBe(6);
    expect(t.truncated).toBe(false);
  });

  it('evicts the minimum under the dimension cap', () => {
    const agg = new SlidingWindowAggregator({
      bucketMs: 100,
      windowMs: 1_000,
      maxDimensions: 2,
    });
    agg.hit('l', 'x');
    agg.hit('l', 'y');
    agg.hit('l', 'y');
    agg.hit('l', 'z'); // x evicted (count 1 < 2)
    const t = agg.topN('l', 10);
    expect(t.truncated).toBe(true);
    expect(t.entries.map((e) => e.key).sort()).toEqual(['y', 'z']);
    expect(t.total).toBe(4); // total counts evicted hits too
  });

  it('empty list yields empty entries but keeps truncated flag', () => {
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000 });
    expect(agg.topN('none', 5).entries).toEqual([]);
    expect(agg.topN('none', 5).total).toBe(0);
  });
});

describe('SlidingWindowAggregator — prune', () => {
  it('removes metrics that went quiet', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000, clock });
    agg.record({ metric: 'stale', timestamp: 0 });
    agg.record({ metric: 'live', timestamp: 5_000 });
    const removed = agg.prune(5_000);
    expect(removed).toBe(1);
    expect(agg.metrics()).toEqual(['live']);
  });
});

describe('EventTracker — validation', () => {
  let tracker: EventTracker;
  const schema: EventSchema = {
    name: 'signup',
    fields: {
      plan: { type: 'string', enum: ['free', 'pro'] },
      seats: { type: 'number', min: 1, max: 500, optional: true },
      trial: { type: 'boolean', optional: true },
    },
  };

  beforeEach(() => {
    tracker = new EventTracker({ clock: new ManualAnalyticsClock2(1_000) });
    tracker.registerSchema(schema);
  });

  it('accepts valid events and stores them', () => {
    const r = tracker.track({ name: 'signup', properties: { plan: 'pro', seats: 5 } });
    expect(r.accepted).toBe(true);
    expect(tracker.size).toBe(1);
    expect(tracker.query({})[0]!.properties.plan).toBe('pro');
  });

  it('rejects missing required fields', () => {
    const r = tracker.track({ name: 'signup', properties: {} });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]!.reason).toBe('missing-required');
    expect(tracker.size).toBe(0);
  });

  it('rejects wrong types and out-of-range numbers', () => {
    const wrong = tracker.track({ name: 'signup', properties: { plan: 7 as unknown as string } });
    expect(wrong.issues[0]!.reason).toBe('wrong-type');
    const range = tracker.track({
      name: 'signup',
      properties: { plan: 'free', seats: 0 },
    });
    expect(range.issues[0]!.reason).toBe('out-of-range');
  });

  it('rejects non-enum strings and undeclared fields', () => {
    const bad = tracker.track({ name: 'signup', properties: { plan: 'enterprise' } });
    expect(bad.issues[0]!.reason).toBe('not-in-enum');
    const extra = tracker.track({
      name: 'signup',
      properties: { plan: 'pro', hack: 'x' },
    });
    expect(extra.issues[0]!.reason).toBe('unknown-field');
  });

  it('allowExtra permits undeclared fields', () => {
    tracker.registerSchema({ name: 'loose', fields: {}, allowExtra: true });
    const r = tracker.track({ name: 'loose', properties: { anything: 'goes' } });
    expect(r.accepted).toBe(true);
  });

  it('rejects events with no registered schema', () => {
    const r = tracker.track({ name: 'ghost' });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]!.reason).toBe('unknown-event');
  });
});

describe('EventTracker — sampling', () => {
  it('samples deterministically per subject', () => {
    const t = new EventTracker({ clock: new ManualAnalyticsClock2() });
    t.registerSchema({ name: 'e', fields: {}, sampleRate: 0.5 });
    const results = new Map<boolean, number>();
    let kept = 0;
    let dropped = 0;
    for (let i = 0; i < 200; i++) {
      const r = t.track({ name: 'e', subjectId: `u${i}` });
      if (r.accepted) kept++;
      else if (r.sampledOut) dropped++;
      results.set(r.accepted, (results.get(r.accepted) ?? 0) + 1);
    }
    expect(kept).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(0);
    expect(kept + dropped).toBe(200);

    // Same subject always lands on the same side.
    const a1 = t.track({ name: 'e', subjectId: 'u0' });
    const a2 = t.track({ name: 'e', subjectId: 'u0' });
    expect(a1.accepted).toBe(a2.accepted);
  });

  it('anonymous events use the random source', () => {
    const t = new EventTracker({
      clock: new ManualAnalyticsClock2(),
      random: new SequenceRandomSource([0.1, 0.9]),
    });
    t.registerSchema({ name: 'e', fields: {}, sampleRate: 0.5 });
    expect(t.track({ name: 'e' }).accepted).toBe(true); // roll 0.1
    expect(t.track({ name: 'e' }).sampledOut).toBe(true); // roll 0.9
  });

  it('sampleRate of 0 keeps nothing but stats still count', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'e', fields: {}, sampleRate: 0 });
    const r = t.track({ name: 'e', subjectId: 'x' });
    expect(r.sampledOut).toBe(true);
    const s = t.schemaStats().find((x) => x.name === 'e')!;
    expect(s.valid).toBe(1);
    expect(s.sampledOut).toBe(1);
    expect(s.stored).toBe(0);
  });
});

describe('EventTracker — query & stats', () => {
  it('filters by name, subject and time range', () => {
    const t = new EventTracker({ clock: new ManualAnalyticsClock2(0) });
    t.registerSchema({ name: 'a', fields: {} });
    t.registerSchema({ name: 'b', fields: {} });
    t.track({ name: 'a', subjectId: 'u1', timestamp: 100 });
    t.track({ name: 'a', subjectId: 'u2', timestamp: 200 });
    t.track({ name: 'b', subjectId: 'u1', timestamp: 300 });

    expect(t.query({ name: 'a' }).length).toBe(2);
    expect(t.query({ subjectId: 'u1' }).length).toBe(2);
    expect(t.query({ fromMs: 150, toMs: 300 }).length).toBe(1);
    expect(t.query({ name: 'a', offset: 1 }).length).toBe(1);
    expect(t.query({ limit: 1 }).length).toBe(1);
  });

  it('evicts oldest when the cap is hit', () => {
    const t = new EventTracker({ maxStoredEvents: 3 });
    t.registerSchema({ name: 'e', fields: {} });
    for (let i = 0; i < 5; i++) t.track({ name: 'e', timestamp: i });
    expect(t.size).toBe(3);
    expect(t.evictedCount).toBe(2);
    expect(t.query({})[0]!.timestamp).toBe(2);
  });

  it('tracks per-schema stats', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'x', fields: { v: { type: 'number' } } });
    t.track({ name: 'x', properties: { v: 1 } });
    t.track({ name: 'x', properties: { v: 'bad' as unknown as number } });
    t.track({ name: 'unregistered' });
    const stats = t.schemaStats();
    const x = stats.find((s) => s.name === 'x')!;
    expect(x.valid).toBe(1);
    expect(x.invalid).toBe(1);
    expect(stats.find((s) => s.name === 'unregistered')!.invalid).toBe(1);
  });
});

describe('AttributionModeler', () => {
  let m: AttributionModeler;

  const journey = (mod: AttributionModeler): void => {
    mod.addTouch('u', { channel: 'paid-search', timestamp: 1_000 });
    mod.addTouch('u', { channel: 'email', timestamp: 2_000 });
    mod.addTouch('u', { channel: 'organic', timestamp: 3_000 });
    mod.addConversion('u', { timestamp: 4_000, value: 100 });
  };

  beforeEach(() => {
    m = new AttributionModeler();
    journey(m);
  });

  it('first-touch gives all credit to the earliest touch', () => {
    const r = m.attribute('u', 'first-touch');
    expect(r.channels).toEqual([
      { channel: 'paid-search', credit: 1, value: 100, share: 1 },
      { channel: 'email', credit: 0, value: 0, share: 0 },
      { channel: 'organic', credit: 0, value: 0, share: 0 },
    ]);
  });

  it('last-touch gives all credit to the latest touch', () => {
    const r = m.attribute('u', 'last-touch');
    expect(r.channels[0]!.channel).toBe('organic');
    expect(r.channels[0]!.credit).toBe(1);
  });

  it('linear splits credit evenly', () => {
    const r = m.attribute('u', 'linear');
    for (const c of r.channels) {
      expect(c.credit).toBeCloseTo(1 / 3, 6);
      expect(c.value).toBeCloseTo(100 / 3, 6);
    }
    expect(r.channels.length).toBe(3);
  });

  it('time-decay favors recent touches', () => {
    const half = new AttributionModeler({ halfLifeMs: 1_000 });
    journey(half);
    const r = half.attribute('u', 'time-decay');
    const organic = r.channels.find((c) => c.channel === 'organic')!;
    const email = r.channels.find((c) => c.channel === 'email')!;
    const paid = r.channels.find((c) => c.channel === 'paid-search')!;
    // ages: organic 1000 (0.5), email 2000 (0.25), paid 3000 (0.125)
    expect(organic.credit).toBeCloseTo(0.5 / 0.875, 6);
    expect(email.credit).toBeCloseTo(0.25 / 0.875, 6);
    expect(paid.credit).toBeCloseTo(0.125 / 0.875, 6);
    expect(organic.credit).toBeGreaterThan(paid.credit);
  });

  it('position-based is U-shaped', () => {
    const r = m.attribute('u', 'position-based');
    const get = (ch: string) => r.channels.find((c) => c.channel === ch)!;
    expect(get('paid-search').credit).toBeCloseTo(0.4, 6);
    expect(get('organic').credit).toBeCloseTo(0.4, 6);
    expect(get('email').credit).toBeCloseTo(0.2, 6);
  });

  it('position-based splits 50/50 with two touches', () => {
    const two = new AttributionModeler();
    two.addTouch('u', { channel: 'a', timestamp: 1 });
    two.addTouch('u', { channel: 'b', timestamp: 2 });
    two.addConversion('u', { timestamp: 3 });
    const r = two.attribute('u', 'position-based');
    expect(r.channels.find((c) => c.channel === 'a')!.credit).toBeCloseTo(0.5, 6);
    expect(r.channels.find((c) => c.channel === 'b')!.credit).toBeCloseTo(0.5, 6);
  });

  it('excludes touches after conversion and outside lookback', () => {
    const w = new AttributionModeler({ lookbackMs: 1_500 });
    w.addTouch('u', { channel: 'old', timestamp: 100 });
    w.addTouch('u', { channel: 'recent', timestamp: 3_000 });
    w.addConversion('u', { timestamp: 4_000 });
    const r = w.attribute('u', 'linear');
    expect(r.channels.length).toBe(1);
    expect(r.channels[0]!.channel).toBe('recent');
  });

  it('counts unattributed conversions separately', () => {
    const r = (() => {
      m.addConversion('ghost', { timestamp: 5_000 });
      return m.attributeAll('linear');
    })();
    expect(r.conversionsAttributed).toBe(1);
    expect(r.conversionsUnattributed).toBe(1);
  });

  it('keeps touches sorted on out-of-order insert', () => {
    const o = new AttributionModeler();
    o.addTouch('u', { channel: 'late', timestamp: 900 });
    o.addTouch('u', { channel: 'early', timestamp: 100 });
    o.addConversion('u', { timestamp: 1_000 });
    const r = o.attribute('u', 'first-touch');
    expect(r.channels[0]!.channel).toBe('early');
  });

  it('attributeAll aggregates across subjects', () => {
    m.addTouch('v', { channel: 'email', timestamp: 100 });
    m.addConversion('v', { timestamp: 200, value: 50 });
    const r = m.attributeAll('last-touch');
    expect(r.conversionsAttributed).toBe(2);
    expect(r.totalValue).toBe(150);
    const email = r.channels.find((c) => c.channel === 'email')!;
    expect(email.credit).toBe(1); // last-touch: email only wins v's conversion
    expect(email.value).toBe(50);
    const organic = r.channels.find((c) => c.channel === 'organic')!;
    expect(organic.credit).toBe(1); // last touch of u's journey
    expect(organic.value).toBe(100);
  });

  it('forget removes a subject', () => {
    expect(m.forget('u')).toBe(true);
    expect(m.touchCount('u')).toBe(0);
    expect(m.forget('u')).toBe(false);
  });
});

describe('DashboardComposer', () => {
  it('renders all panel kinds into a snapshot', () => {
    const clock = new ManualAnalyticsClock2(60_000);
    const agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 60_000, clock });
    const tracker = new EventTracker({ clock });
    const attr = new AttributionModeler();

    agg.record({ metric: 'reqs', timestamp: 59_000 });
    agg.record({ metric: 'reqs', timestamp: 59_500 });
    agg.hit('pages', '/home');
    agg.hit('pages', '/home');
    agg.hit('pages', '/about');

    tracker.registerSchema({ name: 'click', fields: {} });
    tracker.track({ name: 'click', timestamp: 59_000 });
    tracker.track({ name: 'click', timestamp: 59_100 });

    attr.addTouch('u', { channel: 'email', timestamp: 1_000 });
    attr.addConversion('u', { timestamp: 2_000 });

    const composer = new DashboardComposer(agg, tracker, attr, { clock });
    const snap = composer.render({
      id: 'dash-1',
      title: 'Ops overview',
      panels: [
        { kind: 'counter', id: 'c', title: 'Requests', metric: 'reqs', aggregate: 'count' },
        { kind: 'sparkline', id: 's', title: 'Reqs', metric: 'reqs', aggregate: 'count', points: 4 },
        { kind: 'top-n', id: 't', title: 'Pages', list: 'pages', n: 1 },
        { kind: 'event-count', id: 'e', title: 'Events', withinMs: 5_000 },
        { kind: 'attribution', id: 'a', title: 'Channels', model: 'last-touch' },
      ],
    });

    expect(snap.renderedAt).toBe(60_000);
    expect(snap.panels.length).toBe(5);

    const counter = snap.panels[0]!;
    expect(counter.kind).toBe('counter');
    if (counter.kind === 'counter') expect(counter.value).toBe(2);

    const spark = snap.panels[1]!;
    if (spark.kind === 'sparkline') {
      expect(spark.buckets.length).toBe(4);
      expect(spark.buckets[3]!.value).toBe(2);
    }

    const top = snap.panels[2]!;
    if (top.kind === 'top-n') {
      expect(top.entries[0]!.key).toBe('/home');
      expect(top.entries[0]!.count).toBe(2);
    }

    const ev = snap.panels[3]!;
    if (ev.kind === 'event-count') {
      expect(ev.counts).toEqual([{ name: 'click', count: 2 }]);
    }

    const at = snap.panels[4]!;
    if (at.kind === 'attribution') {
      expect(at.channels[0]!.channel).toBe('email');
      expect(at.conversionsAttributed).toBe(1);
    }
  });

  it('renders gracefully without tracker/attribution deps', () => {
    const clock = new ManualAnalyticsClock2(0);
    const agg = new SlidingWindowAggregator({ bucketMs: 100, windowMs: 1_000, clock });
    const composer = new DashboardComposer(agg, null, null, { clock });
    const snap = composer.render({
      id: 'd',
      title: 'minimal',
      panels: [
        { kind: 'event-count', id: 'e', title: 'E' },
        { kind: 'attribution', id: 'a', title: 'A', model: 'linear' },
      ],
    });
    const ev = snap.panels[0]!;
    if (ev.kind === 'event-count') expect(ev.counts).toEqual([]);
    const at = snap.panels[1]!;
    if (at.kind === 'attribution') expect(at.channels).toEqual([]);
  });
});
