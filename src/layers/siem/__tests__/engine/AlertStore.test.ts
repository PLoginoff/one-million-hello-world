/**
 * Alert manager + event store tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  AlertManager,
  AlertStateError,
  CorrelationMatch,
  EventStore,
  NormalizedEvent,
  SeverityScorer,
} from '../../engine';

function mkMatch(partial: Partial<CorrelationMatch> = {}): CorrelationMatch {
  const base: NormalizedEvent = {
    id: 1, timestampMs: 0, raw: 'x', severity: 'info', outcome: 'failure',
    fields: {}, parseQuality: 'full', user: 'bob', sourceIp: '1.2.3.4',
  };
  return {
    ruleId: 'r1', ruleName: 'Test Rule', severity: 'high',
    startedMs: 0, completedMs: 100, events: [base],
    dedupKey: 'r1:bob:1.2.3.4',
    ...partial,
  };
}

describe('AlertManager', () => {
  let clock: ManualClock;
  let mgr: AlertManager;

  beforeEach(() => {
    clock = new ManualClock(0);
    mgr = new AlertManager({}, clock);
  });

  it('fires a new alert', () => {
    const a = mgr.fire(mkMatch());
    expect(a.status).toBe('firing');
    expect(a.occurrences).toBe(1);
    expect(a.ruleId).toBe('r1');
  });

  it('dedups repeat fires on the same key', () => {
    const a1 = mgr.fire(mkMatch());
    const a2 = mgr.fire(mkMatch());
    expect(a1.id).toBe(a2.id);
    expect(a2.occurrences).toBe(2);
    expect(mgr.query({ status: 'firing' }).length).toBe(1);
  });

  it('acknowledge transitions firing → acknowledged', () => {
    const a = mgr.fire(mkMatch());
    mgr.acknowledge(a.id, 'analyst-1');
    expect(mgr.get(a.id)?.status).toBe('acknowledged');
    expect(mgr.get(a.id)?.acknowledgedBy).toBe('analyst-1');
  });

  it('resolve closes an alert', () => {
    const a = mgr.fire(mkMatch());
    mgr.resolve(a.id, 'analyst-2');
    expect(mgr.get(a.id)?.status).toBe('resolved');
  });

  it('rejects acknowledge on a resolved alert', () => {
    const a = mgr.fire(mkMatch());
    mgr.resolve(a.id, 'x');
    expect(() => mgr.acknowledge(a.id, 'x')).toThrow(AlertStateError);
  });

  it('resolved alert reopens on a new fire', () => {
    const a = mgr.fire(mkMatch());
    mgr.resolve(a.id, 'x');
    const reopened = mgr.fire(mkMatch());
    expect(reopened.id).toBe(a.id);
    expect(reopened.status).toBe('firing');
    expect(reopened.resolvedBy).toBeUndefined();
  });

  it('filters by status and minimum score', () => {
    mgr.fire(mkMatch({ dedupKey: 'k1', severity: 'critical' }));
    mgr.fire(mkMatch({ dedupKey: 'k2', severity: 'low' }));
    const high = mgr.query({ minScore: 80 });
    expect(high.length).toBe(1);
    expect(high[0].dedupKey).toBe('k1');
  });

  it('counts by status', () => {
    const a = mgr.fire(mkMatch({ dedupKey: 'a' }));
    mgr.fire(mkMatch({ dedupKey: 'b' }));
    mgr.acknowledge(a.id, 'x');
    const c = mgr.counts();
    expect(c.acknowledged).toBe(1);
    expect(c.firing).toBe(1);
  });
});

describe('SeverityScorer', () => {
  it('scores by severity base', () => {
    const s = new SeverityScorer();
    const low = s.score(mkMatch({ severity: 'low' }), 1);
    const crit = s.score(mkMatch({ severity: 'critical' }), 1);
    expect(crit).toBeGreaterThan(low);
  });

  it('adds watchlist bonus', () => {
    const s = new SeverityScorer({ watchlistIps: ['1.2.3.4'] });
    const withWatch = s.score(mkMatch(), 1);
    const without = new SeverityScorer().score(mkMatch(), 1);
    expect(withWatch).toBeGreaterThan(without);
  });

  it('repeat fires increase score', () => {
    const s = new SeverityScorer();
    const first = s.score(mkMatch(), 1);
    const fifth = s.score(mkMatch(), 5);
    expect(fifth).toBeGreaterThan(first);
  });
});

describe('EventStore', () => {
  function event(id: number, ts: number, fields: Record<string, string> = {}): NormalizedEvent {
    return {
      id, timestampMs: ts, raw: `raw-${id}`, severity: 'info', outcome: 'unknown',
      fields, parseQuality: 'full', ...({} as object),
    };
  }

  it('stores and searches by field and time', () => {
    const clock = new ManualClock(0);
    const store = new EventStore(undefined, clock);
    store.addAll([
      event(1, 100, { user: 'a', action: 'login' }),
      event(2, 200, { user: 'b', action: 'logout' }),
      event(3, 300, { user: 'a', action: 'login' }),
    ]);
    expect(store.search({ fields: { user: 'a' } }).map((e) => e.id)).toEqual([1, 3]);
    expect(store.search({ fromMs: 150, toMs: 350 }).map((e) => e.id)).toEqual([2, 3]);
    expect(store.search({ text: 'raw-2' }).map((e) => e.id)).toEqual([2]);
  });

  it('ages events through retention tiers', () => {
    const clock = new ManualClock(0);
    const store = new EventStore(
      [
        { tier: 'hot', olderThanMs: 1_000 },
        { tier: 'warm', olderThanMs: 5_000 },
        { tier: 'cold', olderThanMs: 10_000 },
      ],
      clock
    );
    store.add(event(1, 0));
    store.add(event(2, 0));
    clock.advance(2_000);
    let r = store.applyRetention();
    expect(r.movedToWarm).toBe(2);
    expect(store.size('warm')).toBe(2);

    clock.advance(4_000); // now 6_000 — warm→cold
    r = store.applyRetention();
    expect(r.movedToCold).toBe(2);

    clock.advance(5_000); // now 11_000 — cold expired
    r = store.applyRetention();
    expect(r.expired).toBe(2);
    expect(store.size()).toBe(0);
  });

  it('search spans tiers', () => {
    const clock = new ManualClock(0);
    const store = new EventStore(
      [
        { tier: 'hot', olderThanMs: 100 },
        { tier: 'warm', olderThanMs: 1_000 },
        { tier: 'cold', olderThanMs: 9_999 },
      ],
      clock
    );
    store.add(event(1, 0, { tag: 'x' }));
    clock.advance(500);
    store.add(event(2, 500, { tag: 'x' }));
    store.applyRetention();
    expect(store.size('warm')).toBe(1);
    expect(store.size('hot')).toBe(1);
    expect(store.search({ fields: { tag: 'x' } }).length).toBe(2);
  });

  it('respects search limit', () => {
    const store = new EventStore(undefined, new ManualClock(0));
    for (let i = 0; i < 10; i++) store.add(event(i, i));
    expect(store.search({ limit: 3 }).length).toBe(3);
  });
});
