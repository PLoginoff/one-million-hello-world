/**
 * Deep coverage for AttributionModeler and DashboardComposer:
 * model math, lookback semantics, multi-conversion journeys and
 * dashboard edge cases.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AttributionModeler } from '../AttributionModeler';
import { DashboardComposer } from '../DashboardComposer';
import { SlidingWindowAggregator } from '../SlidingWindowAggregator';
import { EventTracker } from '../EventTracker';
import { ManualAnalyticsClock2 } from '../types';

describe('AttributionModeler — model math', () => {
  it('linear credit sums to 1 across any touch count', () => {
    for (const n of [1, 2, 5, 11]) {
      const m = new AttributionModeler();
      for (let i = 0; i < n; i++) {
        m.addTouch('u', { channel: `c${i}`, timestamp: i * 100 });
      }
      m.addConversion('u', { timestamp: 99_999 });
      const r = m.attribute('u', 'linear');
      const sum = r.channels.reduce((s, c) => s + c.credit, 0);
      expect(sum).toBeCloseTo(1, 9);
      expect(r.channels.length).toBe(n);
    }
  });

  it('time-decay weights halve exactly at each half-life', () => {
    const m = new AttributionModeler({ halfLifeMs: 100 });
    m.addTouch('u', { channel: 'old', timestamp: 0 }); // age 300 → 2^-3 = 1/8
    m.addTouch('u', { channel: 'mid', timestamp: 200 }); // age 100 → 1/2
    m.addTouch('u', { channel: 'new', timestamp: 299 }); // age 1 → ~1
    m.addConversion('u', { timestamp: 300 });
    const r = m.attribute('u', 'time-decay');
    const wNew = Math.pow(2, -0.01); // age 1 ms
    const total = 1 / 8 + 1 / 2 + wNew;
    expect(r.channels.find((c) => c.channel === 'new')!.credit).toBeCloseTo(wNew / total, 9);
    expect(r.channels.find((c) => c.channel === 'mid')!.credit).toBeCloseTo(0.5 / total, 9);
    expect(r.channels.find((c) => c.channel === 'old')!.credit).toBeCloseTo(0.125 / total, 9);
  });

  it('position-based with 4 touches gives middles 10% each', () => {
    const m = new AttributionModeler();
    for (let i = 0; i < 4; i++) m.addTouch('u', { channel: `c${i}`, timestamp: i });
    m.addConversion('u', { timestamp: 100 });
    const r = m.attribute('u', 'position-based');
    const get = (i: number) => r.channels.find((c) => c.channel === `c${i}`)!.credit;
    expect(get(0)).toBeCloseTo(0.4, 9);
    expect(get(1)).toBeCloseTo(0.1, 9);
    expect(get(2)).toBeCloseTo(0.1, 9);
    expect(get(3)).toBeCloseTo(0.4, 9);
  });

  it('a single touch gets 100% under every model', () => {
    const models = ['first-touch', 'last-touch', 'linear', 'time-decay', 'position-based'] as const;
    for (const model of models) {
      const m = new AttributionModeler();
      m.addTouch('u', { channel: 'only', timestamp: 1 });
      m.addConversion('u', { timestamp: 2 });
      const r = m.attribute('u', model);
      expect(r.channels.length).toBe(1);
      expect(r.channels[0]!.credit).toBe(1);
      expect(r.channels[0]!.share).toBe(1);
    }
  });

  it('conversion without value defaults to value 1', () => {
    const m = new AttributionModeler();
    m.addTouch('u', { channel: 'a', timestamp: 1 });
    m.addConversion('u', { timestamp: 2 });
    const r = m.attribute('u', 'first-touch');
    expect(r.totalValue).toBe(1);
    expect(r.channels[0]!.value).toBe(1);
  });
});

describe('AttributionModeler — lookback & ordering', () => {
  it('lookback boundary is inclusive', () => {
    const m = new AttributionModeler({ lookbackMs: 1_000 });
    m.addTouch('u', { channel: 'edge', timestamp: 4_000 });
    m.addTouch('u', { channel: 'outside', timestamp: 3_999 });
    m.addConversion('u', { timestamp: 5_000 });
    const eligible = m.eligibleTouches('u', 5_000);
    expect(eligible.map((t) => t.channel)).toEqual(['edge']);
  });

  it('touch at conversion timestamp is excluded', () => {
    const m = new AttributionModeler();
    m.addTouch('u', { channel: 'same-instant', timestamp: 1_000 });
    m.addConversion('u', { timestamp: 1_000 });
    const r = m.attribute('u', 'last-touch');
    expect(r.conversionsAttributed).toBe(0);
    expect(r.conversionsUnattributed).toBe(1);
  });

  it('multiple conversions attribute independently over one journey', () => {
    const m = new AttributionModeler();
    m.addTouch('u', { channel: 'a', timestamp: 100 });
    m.addTouch('u', { channel: 'b', timestamp: 200 });
    m.addConversion('u', { timestamp: 300, value: 10 });
    m.addTouch('u', { channel: 'c', timestamp: 400 });
    m.addConversion('u', { timestamp: 500, value: 20 });
    const r = m.attribute('u', 'last-touch');
    // conv1 → b (10), conv2 → c (20)
    const b = r.channels.find((x) => x.channel === 'b')!;
    const c = r.channels.find((x) => x.channel === 'c')!;
    expect(b.value).toBe(10);
    expect(c.value).toBe(20);
    expect(c.share).toBeCloseTo(0.5, 6);
  });

  it('out-of-order touches at same timestamp keep insertion order', () => {
    const m = new AttributionModeler();
    m.addTouch('u', { channel: 'second', timestamp: 100 });
    m.addTouch('u', { channel: 'first', timestamp: 100 });
    m.addConversion('u', { timestamp: 200 });
    const r = m.attribute('u', 'first-touch');
    expect(r.channels[0]!.channel).toBe('second');
  });

  it('journeys are independent between subjects', () => {
    const m = new AttributionModeler();
    m.addTouch('u1', { channel: 'x', timestamp: 1 });
    m.addTouch('u2', { channel: 'y', timestamp: 1 });
    m.addConversion('u1', { timestamp: 10 });
    m.addConversion('u2', { timestamp: 10 });
    expect(m.attribute('u1', 'first-touch').channels[0]!.channel).toBe('x');
    expect(m.attribute('u2', 'first-touch').channels[0]!.channel).toBe('y');
  });

  it('attribute on unknown subject yields a zeroed report', () => {
    const m = new AttributionModeler();
    const r = m.attribute('ghost', 'linear');
    expect(r.conversionsAttributed).toBe(0);
    expect(r.channels).toEqual([]);
    expect(r.totalValue).toBe(0);
  });

  it('channels sort by credit desc then name asc', () => {
    const m = new AttributionModeler();
    m.addTouch('u', { channel: 'zz', timestamp: 1 });
    m.addTouch('u', { channel: 'mm', timestamp: 2 });
    m.addTouch('u', { channel: 'aa', timestamp: 3 });
    m.addConversion('u', { timestamp: 4 });
    const r = m.attribute('u', 'linear');
    expect(r.channels.map((c) => c.channel)).toEqual(['aa', 'mm', 'zz']);
  });
});

describe('DashboardComposer — edges', () => {
  let clock: ManualAnalyticsClock2;
  let agg: SlidingWindowAggregator;
  let tracker: EventTracker;

  beforeEach(() => {
    clock = new ManualAnalyticsClock2(100_000);
    agg = new SlidingWindowAggregator({ bucketMs: 1_000, windowMs: 60_000, clock });
    tracker = new EventTracker({ clock });
  });

  it('preserves panel order from the definition', () => {
    const composer = new DashboardComposer(agg, tracker, null, { clock });
    const snap = composer.render({
      id: 'd',
      title: 't',
      panels: [
        { kind: 'top-n', id: '3', title: '', list: 'l', n: 1 },
        { kind: 'counter', id: '1', title: '', metric: 'm', aggregate: 'count' },
        { kind: 'event-count', id: '2', title: '' },
      ],
    });
    expect(snap.panels.map((p) => p.id)).toEqual(['3', '1', '2']);
  });

  it('counter on an absent metric yields NaN for avg and 0 for count', () => {
    const composer = new DashboardComposer(agg, null, null, { clock });
    const snap = composer.render({
      id: 'd',
      title: 't',
      panels: [
        { kind: 'counter', id: 'a', title: '', metric: 'ghost', aggregate: 'avg' },
        { kind: 'counter', id: 'c', title: '', metric: 'ghost', aggregate: 'count' },
      ],
    });
    const avg = snap.panels[0]!;
    const count = snap.panels[1]!;
    if (avg.kind === 'counter') expect(avg.value).toBeNaN();
    if (count.kind === 'counter') expect(count.value).toBe(0);
  });

  it('event-count names filter restricts to the given set', () => {
    tracker.registerSchema({ name: 'keep', fields: {} });
    tracker.registerSchema({ name: 'skip', fields: {} });
    tracker.track({ name: 'keep', timestamp: 99_000 });
    tracker.track({ name: 'skip', timestamp: 99_000 });
    const composer = new DashboardComposer(agg, tracker, null, { clock });
    const snap = composer.render({
      id: 'd',
      title: 't',
      panels: [{ kind: 'event-count', id: 'e', title: '', names: ['keep'] }],
    });
    const p = snap.panels[0]!;
    if (p.kind === 'event-count') {
      expect(p.counts).toEqual([{ name: 'keep', count: 1 }]);
    }
  });

  it('event-count withinMs excludes older events', () => {
    tracker.registerSchema({ name: 'e', fields: {} });
    tracker.track({ name: 'e', timestamp: 0 }); // way old
    tracker.track({ name: 'e', timestamp: 99_999 });
    const composer = new DashboardComposer(agg, tracker, null, { clock });
    const snap = composer.render({
      id: 'd',
      title: 't',
      panels: [{ kind: 'event-count', id: 'e', title: '', withinMs: 1_000 }],
    });
    const p = snap.panels[0]!;
    if (p.kind === 'event-count') {
      expect(p.counts).toEqual([{ name: 'e', count: 1 }]);
    }
  });

  it('rendered snapshot carries dashboard identity and render time', () => {
    const composer = new DashboardComposer(agg, tracker, null, { clock });
    const snap = composer.render({ id: 'dash-x', title: 'My Dash', panels: [] });
    expect(snap.dashboardId).toBe('dash-x');
    expect(snap.title).toBe('My Dash');
    expect(snap.renderedAt).toBe(100_000);
    expect(snap.panels).toEqual([]);
  });

  it('two renders at different times reflect window movement', () => {
    agg.record({ metric: 'm', timestamp: 99_500 });
    const composer = new DashboardComposer(agg, null, null, { clock });
    const d = {
      id: 'd',
      title: 't',
      panels: [{ kind: 'counter' as const, id: 'c', title: '', metric: 'm', aggregate: 'count' as const }],
    };
    const before = composer.render(d);
    clock.advance(61_000);
    const after = composer.render(d);
    const getVal = (s: typeof before) => {
      const p = s.panels[0]!;
      return p.kind === 'counter' ? p.value : -1;
    };
    expect(getVal(before)).toBe(1);
    expect(getVal(after)).toBe(0); // point aged out of the window
  });
});
