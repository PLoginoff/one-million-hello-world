/**
 * Deep coverage for EventTracker: schema semantics, sampling math,
 * storage eviction, query filters and stats accounting.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { EventTracker, SequenceRandomSource } from '../EventTracker';
import { ManualAnalyticsClock2, EventSchema } from '../types';

const purchase: EventSchema = {
  name: 'purchase',
  fields: {
    sku: { type: 'string' },
    amount: { type: 'number', min: 0 },
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] },
    gift: { type: 'boolean', optional: true },
  },
};

describe('schema semantics', () => {
  let tracker: EventTracker;

  beforeEach(() => {
    tracker = new EventTracker({ clock: new ManualAnalyticsClock2(0) });
    tracker.registerSchema(purchase);
  });

  it('optional fields may be omitted or provided', () => {
    expect(
      tracker.track({ name: 'purchase', properties: { sku: 'a', amount: 1, currency: 'USD' } })
        .accepted
    ).toBe(true);
    expect(
      tracker.track({
        name: 'purchase',
        properties: { sku: 'a', amount: 1, currency: 'USD', gift: true },
      }).accepted
    ).toBe(true);
  });

  it('optional fields are still type-checked when present', () => {
    const r = tracker.track({
      name: 'purchase',
      properties: { sku: 'a', amount: 1, currency: 'USD', gift: 'yes' as unknown as boolean },
    });
    expect(r.accepted).toBe(false);
    expect(r.issues[0]!.field).toBe('gift');
    expect(r.issues[0]!.reason).toBe('wrong-type');
  });

  it('min bound is inclusive; no max means unbounded', () => {
    expect(
      tracker.track({ name: 'purchase', properties: { sku: 'a', amount: 0, currency: 'USD' } })
        .accepted
    ).toBe(true);
    expect(
      tracker.track({
        name: 'purchase',
        properties: { sku: 'a', amount: 1_000_000, currency: 'USD' },
      }).accepted
    ).toBe(true);
  });

  it('all issue kinds can appear in a single event', () => {
    const r = tracker.track({
      name: 'purchase',
      properties: {
        // sku missing → missing-required
        amount: -1, // → out-of-range
        currency: 'JPY', // → not-in-enum
        extra: 'field', // → unknown-field
      },
    });
    const reasons = r.issues.map((i) => i.reason).sort();
    expect(reasons).toEqual(['missing-required', 'not-in-enum', 'out-of-range', 'unknown-field'].sort());
  });

  it('issue detail strings carry context', () => {
    const r = tracker.track({
      name: 'purchase',
      properties: { sku: 'a', amount: 'lots' as unknown as number, currency: 'USD' },
    });
    expect(r.issues[0]!.detail).toContain('expected number');
  });

  it('re-registering a schema replaces validation rules', () => {
    tracker.registerSchema({ name: 'purchase', fields: {} });
    const r = tracker.track({ name: 'purchase' });
    expect(r.accepted).toBe(true);
  });

  it('unregister stops acceptance but stats persist', () => {
    tracker.track({ name: 'purchase', properties: { sku: 'a', amount: 1, currency: 'USD' } });
    expect(tracker.unregisterSchema('purchase')).toBe(true);
    const r = tracker.track({ name: 'purchase', properties: {} });
    expect(r.issues[0]!.reason).toBe('unknown-event');
    const stats = tracker.schemaStats().find((s) => s.name === 'purchase')!;
    expect(stats.valid).toBe(1);
    expect(stats.invalid).toBe(1);
  });

  it('empty-name schema is rejected at registration', () => {
    expect(() => tracker.registerSchema({ name: '', fields: {} })).toThrow();
  });

  it('out-of-range sampleRate is rejected at registration', () => {
    expect(() =>
      tracker.registerSchema({ name: 'x', fields: {}, sampleRate: 1.5 })
    ).toThrow();
    expect(() =>
      tracker.registerSchema({ name: 'x', fields: {}, sampleRate: -0.1 })
    ).toThrow();
  });
});

describe('sampling math', () => {
  it('deterministic sampling is consistent per subject', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'e', fields: {}, sampleRate: 0.25 });
    const outcomes = new Map<string, boolean>();
    for (let i = 0; i < 500; i++) {
      const r = t.track({ name: 'e', subjectId: `s${i % 50}` });
      const prev = outcomes.get(`s${i % 50}`);
      if (prev !== undefined) expect(prev).toBe(r.accepted);
      outcomes.set(`s${i % 50}`, r.accepted);
    }
    const kept = [...outcomes.values()].filter(Boolean).length;
    // Roughly 25% of 50 subjects — wide band to avoid flake.
    expect(kept).toBeGreaterThan(3);
    expect(kept).toBeLessThan(30);
  });

  it('different event names sample the same subject independently', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'a', fields: {}, sampleRate: 0.5 });
    t.registerSchema({ name: 'b', fields: {}, sampleRate: 0.5 });
    const aIn = new Set<string>();
    const bIn = new Set<string>();
    for (let i = 0; i < 300; i++) {
      if (t.track({ name: 'a', subjectId: `u${i}` }).accepted) aIn.add(`u${i}`);
      if (t.track({ name: 'b', subjectId: `u${i}` }).accepted) bIn.add(`u${i}`);
    }
    // Some subjects should be in only one sample — sets differ.
    let diff = 0;
    for (const u of aIn) if (!bIn.has(u)) diff++;
    for (const u of bIn) if (!aIn.has(u)) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it('random-source rolls below rate are kept, at rate are dropped', () => {
    const t = new EventTracker({ random: new SequenceRandomSource([0.499, 0.5]) });
    t.registerSchema({ name: 'e', fields: {}, sampleRate: 0.5 });
    expect(t.track({ name: 'e' }).accepted).toBe(true);
    expect(t.track({ name: 'e' }).sampledOut).toBe(true);
  });
});

describe('query filters', () => {
  let tracker: EventTracker;

  beforeEach(() => {
    tracker = new EventTracker();
    tracker.registerSchema({ name: 'a', fields: {} });
    tracker.registerSchema({ name: 'b', fields: {} });
    for (let i = 0; i < 10; i++) {
      tracker.track({
        name: i % 2 === 0 ? 'a' : 'b',
        subjectId: `u${i % 3}`,
        timestamp: i * 100,
      });
    }
  });

  it('fromMs is inclusive, toMs exclusive', () => {
    const evs = tracker.query({ fromMs: 300, toMs: 700 });
    expect(evs.map((e) => e.timestamp)).toEqual([300, 400, 500, 600]);
  });

  it('offset+limit compose for pagination', () => {
    const page1 = tracker.query({ offset: 0, limit: 3 });
    const page2 = tracker.query({ offset: 3, limit: 3 });
    expect(page1.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(page2.map((e) => e.seq)).toEqual([4, 5, 6]);
  });

  it('combined name+subject+range intersection', () => {
    const evs = tracker.query({ name: 'a', subjectId: 'u0', fromMs: 100 });
    // a events at 0,200,400,600,800 for u0 (i%3==0): i=0(u0,a@0), i=6(u0,a@600)... let me verify:
    // i=0: a u0 @0; i=6: a u0 @600; i=3: b u0 @300; i=9: b u0 @900
    expect(evs.map((e) => e.timestamp)).toEqual([600]);
  });

  it('empty result for impossible filters', () => {
    expect(tracker.query({ name: 'a', subjectId: 'nope' })).toEqual([]);
  });

  it('stored events keep insertion order and carry seqs', () => {
    const evs = tracker.query({});
    expect(evs.length).toBe(10);
    for (let i = 0; i < 10; i++) expect(evs[i]!.seq).toBe(i + 1);
  });
});

describe('storage and stats accounting', () => {
  it('trackAll preserves input order of results', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'ok', fields: {} });
    t.registerSchema({ name: 'need', fields: { v: { type: 'number' } } });
    const results = t.trackAll([
      { name: 'ok' },
      { name: 'need', properties: {} },
      { name: 'ok' },
    ]);
    expect(results.map((r) => r.accepted)).toEqual([true, false, true]);
  });

  it('events evicted by the cap stay counted in schemaStats', () => {
    const t = new EventTracker({ maxStoredEvents: 2 });
    t.registerSchema({ name: 'e', fields: {} });
    t.track({ name: 'e' });
    t.track({ name: 'e' });
    t.track({ name: 'e' });
    const s = t.schemaStats().find((x) => x.name === 'e')!;
    expect(s.stored).toBe(3); // total stored *ever*
    expect(t.size).toBe(2); // currently resident
  });

  it('stored property objects are copies (input mutation is safe)', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'e', fields: {}, allowExtra: true });
    const props: Record<string, string | number | boolean> = { a: 1 };
    t.track({ name: 'e', properties: props });
    props['a'] = 'mutated';
    expect(t.query({})[0]!.properties['a']).toBe(1);
  });

  it('schemaStats is sorted by name and complete', () => {
    const t = new EventTracker();
    t.registerSchema({ name: 'zzz', fields: {} });
    t.registerSchema({ name: 'aaa', fields: {} });
    t.track({ name: 'zzz' });
    t.track({ name: 'aaa' });
    t.track({ name: 'mid' }); // unregistered → stats created on the fly
    const names = t.schemaStats().map((s) => s.name);
    expect(names).toEqual(['aaa', 'mid', 'zzz']);
  });
});
