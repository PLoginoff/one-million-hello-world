/**
 * Recommendation engine additions — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  LinUCBBandit,
  MarkovSequenceModel,
  TrendingTracker,
  CategoryQuota,
  InteractionStream,
  ManualRecClock,
  CategorizedItem,
  InteractionEvent,
} from '../index';

/* ------------------------------------------------------------------ */
/* LinUCBBandit                                                        */
/* ------------------------------------------------------------------ */

describe('LinUCBBandit', () => {
  let bandit: LinUCBBandit;

  beforeEach(() => {
    bandit = new LinUCBBandit({ dims: 4, alpha: 0.5, regularization: 1 });
  });

  it('explores unseen arms first (max bonus on cold start)', () => {
    const ctx = [1, 0, 0, 0];
    const ranked = bandit.rank(['a', 'b', 'c'], ctx);
    // all cold → all estimates 0, identical bonus; deterministic by id
    expect(ranked[0].bonus).toBeGreaterThan(0);
    expect(ranked[0].estimate).toBe(0);
  });

  it('learns reward signal for a context-aligned arm', () => {
    const ctx = [1, 0, 0, 0];
    for (let i = 0; i < 40; i++) bandit.update('good', ctx, 1);
    for (let i = 0; i < 40; i++) bandit.update('bad', ctx, 0);
    const ranked = bandit.rank(['bad', 'good'], ctx);
    expect(ranked[0].arm).toBe('good');
    expect(ranked[0].estimate).toBeGreaterThan(ranked[1].estimate);
  });

  it('reduces bonus as an arm accumulates data', () => {
    const ctx = [1, 0, 0, 0];
    const before = bandit.bonus('x', ctx);
    for (let i = 0; i < 20; i++) bandit.update('x', ctx, 0.5);
    const after = bandit.bonus('x', ctx);
    expect(after).toBeLessThan(before);
  });

  it('learns context-dependent rewards (different directions)', () => {
    // arm A pays off on ctx1, arm B on ctx2
    const c1 = [1, 0, 0, 0];
    const c2 = [0, 1, 0, 0];
    for (let i = 0; i < 50; i++) {
      bandit.update('A', c1, 1);
      bandit.update('A', c2, 0);
      bandit.update('B', c1, 0);
      bandit.update('B', c2, 1);
    }
    expect(bandit.select(['A', 'B'], c1)).toBe('A');
    expect(bandit.select(['A', 'B'], c2)).toBe('B');
  });

  it('decay<1 keeps the model adaptive to reward drift', () => {
    const drift = new LinUCBBandit({ dims: 2, alpha: 0.3, decay: 0.95 });
    const ctx = [1, 0];
    for (let i = 0; i < 60; i++) drift.update('arm', ctx, 1);
    const estBefore = drift.rank(['arm'], ctx)[0].estimate;
    expect(estBefore).toBeGreaterThan(0.5);
    // reward flips to 0 — decayed model should pull the estimate down
    for (let i = 0; i < 80; i++) drift.update('arm', ctx, 0);
    const estAfter = drift.rank(['arm'], ctx)[0].estimate;
    expect(estAfter).toBeLessThan(estBefore * 0.5);
  });

  it('armStats reports pulls and mean reward', () => {
    const ctx = [0, 0, 1, 0];
    bandit.update('m', ctx, 1);
    bandit.update('m', ctx, 0);
    bandit.update('m', ctx, 1);
    const st = bandit.armStats().find((s) => s.arm === 'm')!;
    expect(st.pulls).toBe(3);
    expect(st.meanReward).toBeCloseTo(2 / 3, 6);
  });

  it('validates context dimension', () => {
    expect(() => bandit.update('x', [1, 2], 1)).toThrow();
    expect(() => bandit.rank(['x'], [1, 2, 3])).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* MarkovSequenceModel                                                 */
/* ------------------------------------------------------------------ */

describe('MarkovSequenceModel', () => {
  it('predicts the most common successor', () => {
    const m = new MarkovSequenceModel({ order: 1, smoothing: 0.01 });
    for (let i = 0; i < 10; i++) m.learn(['home', 'search', 'product']);
    const preds = m.predictNext(['home'], 3);
    expect(preds[0].itemId).toBe('search');
    expect(preds[0].probability).toBeGreaterThan(0.8);
  });

  it('order-2 contexts beat unigram when history is informative', () => {
    const m = new MarkovSequenceModel({ order: 2, smoothing: 0.01 });
    // path A: a→b→c always; path B: x→b→d always
    for (let i = 0; i < 20; i++) {
      m.learn(['a', 'b', 'c']);
      m.learn(['x', 'b', 'd']);
    }
    // order-1 context 'b' is ambiguous; order-2 'a,b' is not
    const p1 = m.predictNext(['b'], 2);
    const p2 = m.predictNext(['a', 'b'], 2);
    expect(p2[0].itemId).toBe('c');
    expect(p2[0].probability).toBeGreaterThan(p1.find((p) => p.itemId === 'c')!.probability);
  });

  it('backs off to shorter contexts for unseen states', () => {
    const m = new MarkovSequenceModel({ order: 3, smoothing: 0.05 });
    m.learn(['u', 'v', 'w']);
    // context 'q,v' unseen at order 2 → falls back to unigram 'v' history
    const preds = m.predictNext(['q', 'v'], 3);
    expect(preds.length).toBeGreaterThan(0);
  });

  it('unigram fallback returns popularity when no context matches', () => {
    const m = new MarkovSequenceModel({ order: 2 });
    m.learn(['a', 'b', 'b', 'b', 'c']);
    const preds = m.predictNext(['zzz'], 2);
    // 'b' is the most frequent successor overall
    expect(preds[0].itemId).toBe('b');
  });

  it('decays old transitions when a clock is injected', () => {
    const clock = new ManualRecClock();
    const m = new MarkovSequenceModel(
      { order: 1, halfLifeMs: 1000, smoothing: 0.01 },
      clock
    );
    m.learn(['a', 'b'], 0);
    const pBefore = m.probability(['a'], 'b');
    clock.advance(10_000); // 10 half-lives → counts ~0
    // after aging, smoothed probability collapses toward uniform
    m.learn(['a', 'c'], 10_000); // fresh transition
    const pB = m.probability(['a'], 'b');
    const pC = m.probability(['a'], 'c');
    expect(pC).toBeGreaterThan(pB);
    expect(pBefore).toBeGreaterThan(pB);
  });

  it('logLoss improves as the model sees repeated patterns', () => {
    const m = new MarkovSequenceModel({ order: 1, smoothing: 0.1 });
    // first pass — model is cold
    const seqs = Array.from({ length: 5 }, () => ['p', 'q', 'r', 's'] as const);
    const first = m.logLoss(seqs);
    const second = m.logLoss(seqs);
    expect(second).toBeLessThan(first);
  });

  it('stats() reports context structure', () => {
    const m = new MarkovSequenceModel({ order: 2 });
    m.learn(['a', 'b', 'c', 'd']);
    const st = m.stats();
    expect(st.contexts).toBeGreaterThan(0);
    expect(st.transitions).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* TrendingTracker                                                     */
/* ------------------------------------------------------------------ */

describe('TrendingTracker', () => {
  it('ranks recent bursts above older steady volume', () => {
    const clock = new ManualRecClock();
    const t = new TrendingTracker({ halfLifeMs: 60_000 }, clock);
    // 'old' got 10 purchases a long time ago
    for (let i = 0; i < 10; i++) {
      t.record({ userId: 'u', itemId: 'old', kind: 'purchase', timestamp: 0 });
    }
    clock.advance(3_600_000); // 60 half-lives → ~0
    // 'viral' gets 4 purchases now
    for (let i = 0; i < 4; i++) {
      t.record({ userId: 'u', itemId: 'viral', kind: 'purchase', timestamp: clock.now() });
    }
    const top = t.top(2);
    expect(top[0].itemId).toBe('viral');
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it('weights event kinds (purchase > view)', () => {
    const clock = new ManualRecClock();
    const t = new TrendingTracker({ halfLifeMs: 60_000 }, clock);
    t.record({ userId: 'u', itemId: 'viewed', kind: 'view', timestamp: 0 });
    t.record({ userId: 'u', itemId: 'viewed', kind: 'view', timestamp: 0 });
    t.record({ userId: 'u', itemId: 'viewed', kind: 'view', timestamp: 0 });
    t.record({ userId: 'u', itemId: 'bought', kind: 'purchase', timestamp: 0 });
    expect(t.score('bought')).toBeGreaterThan(t.score('viewed'));
  });

  it('compacts overflowing event rings into an exact checkpoint', () => {
    const clock = new ManualRecClock();
    const t = new TrendingTracker({ halfLifeMs: 60_000, maxEventsPerItem: 8 }, clock);
    const n = 30;
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      times.push(clock.now());
      t.record({ userId: 'u', itemId: 'hot', kind: 'click', timestamp: clock.now() });
      clock.advance(500);
    }
    // compare against a mathematically exact decayed sum
    const now = clock.now();
    const hl = 60_000;
    let exact = 0;
    for (const ts of times) exact += 2 * Math.pow(0.5, (now - ts) / hl);
    expect(t.score('hot')).toBeCloseTo(exact, 6);
  });

  it('topAmong restricts the leaderboard to candidates', () => {
    const clock = new ManualRecClock();
    const t = new TrendingTracker({}, clock);
    t.record({ userId: 'u', itemId: 'a', kind: 'view', timestamp: 0 });
    t.record({ userId: 'u', itemId: 'b', kind: 'view', timestamp: 0 });
    const top = t.topAmong(['b'], 5);
    expect(top.length).toBe(1);
    expect(top[0].itemId).toBe('b');
  });
});

/* ------------------------------------------------------------------ */
/* CategoryQuota                                                       */
/* ------------------------------------------------------------------ */

describe('CategoryQuota', () => {
  const items = (spec: Array<[string, string, number]>): CategorizedItem[] =>
    spec.map(([itemId, category, score]) => ({ itemId, category, score }));

  it('enforces max caps by demoting overflow', () => {
    const q = new CategoryQuota([{ category: 'sponsored', max: 2 }]);
    const ranked = items([
      ['s1', 'sponsored', 10],
      ['s2', 'sponsored', 9],
      ['s3', 'sponsored', 8],
      ['o1', 'organic', 7],
      ['o2', 'organic', 6],
    ]);
    const r = q.enforce(ranked, 4);
    const cats = r.items.map((i) => i.category);
    expect(cats.filter((c) => c === 'sponsored').length).toBe(2);
    expect(r.dropped).toContain('s3');
  });

  it('promotes items to satisfy min quotas', () => {
    const q = new CategoryQuota([
      { category: 'local', min: 2 },
      { category: 'national', max: 4 },
    ]);
    const ranked = items([
      ['n1', 'national', 10],
      ['n2', 'national', 9],
      ['n3', 'national', 8],
      ['n4', 'national', 7],
      ['l1', 'local', 3],
      ['l2', 'local', 2],
    ]);
    const r = q.enforce(ranked, 5);
    const locals = r.items.filter((i) => i.category === 'local');
    expect(locals.length).toBe(2);
    // l1 fit in pass 1; only l2 needed a promotion swap (displaces n4)
    expect(r.promoted).toEqual(['l2']);
    expect(r.items.map((i) => i.itemId)).toContain('l1');
  });

  it('reports unmet quotas when supply is exhausted', () => {
    const q = new CategoryQuota([{ category: 'rare', min: 3 }]);
    const ranked = items([
      ['a1', 'common', 5],
      ['r1', 'rare', 4],
      ['a2', 'common', 3],
    ]);
    const r = q.enforce(ranked, 3);
    expect(r.unmet).toContain('rare');
  });

  it('never displaces a min-protected category for another min', () => {
    const q = new CategoryQuota([
      { category: 'x', min: 1 },
      { category: 'y', min: 2 },
    ]);
    const ranked = items([
      ['x1', 'x', 10],
      ['z1', 'z', 9],
      ['y1', 'y', 5],
      ['y2', 'y', 4],
    ]);
    const r = q.enforce(ranked, 3);
    const cats = r.items.map((i) => i.category).sort();
    expect(cats).toEqual(['x', 'y', 'y']);
  });

  it('respects topN as output size', () => {
    const q = new CategoryQuota([]);
    const ranked = items([
      ['a', 'c', 3],
      ['b', 'c', 2],
      ['d', 'c', 1],
    ]);
    expect(q.enforce(ranked, 2).items.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* InteractionStream                                                   */
/* ------------------------------------------------------------------ */

describe('InteractionStream', () => {
  const ev = (
    user: string,
    item: string,
    kind: InteractionEvent['kind'],
    t: number
  ): InteractionEvent => ({ userId: user, itemId: item, kind, timestamp: t });

  it('updates the online learner per event (no retrain)', () => {
    const clock = new ManualRecClock();
    const s = new InteractionStream({ sessionGapMs: 1000 }, {}, clock);
    for (let i = 0; i < 30; i++) {
      s.record(ev('u1', 'liked-item', 'purchase', i * 100));
      s.record(ev('u1', 'hated-item', 'skip', i * 100));
    }
    const pLiked = s.learner.predict('u1', 'liked-item').value;
    const pHated = s.learner.predict('u1', 'hated-item').value;
    expect(pLiked).toBeGreaterThan(pHated);
  });

  it('closes sessions on the gap boundary and feeds the sequence model', () => {
    const clock = new ManualRecClock();
    const s = new InteractionStream({ sessionGapMs: 60_000 }, {}, clock);
    // session 1: a→b→c; gap; session 2: a→b→c again
    s.record(ev('u', 'a', 'view', 0));
    s.record(ev('u', 'b', 'view', 10_000));
    s.record(ev('u', 'c', 'view', 20_000));
    s.record(ev('u', 'a', 'view', 200_000));
    s.record(ev('u', 'b', 'view', 210_000));
    s.record(ev('u', 'c', 'view', 220_000));
    s.flush();
    expect(s.sessionsClosed).toBe(2);
    const preds = s.sequence.predictNext(['a', 'b'], 2);
    expect(preds[0].itemId).toBe('c');
  });

  it('tracks trending items as events stream', () => {
    const clock = new ManualRecClock();
    const s = new InteractionStream({}, {}, clock);
    s.record(ev('u', 'hot', 'purchase', 0));
    s.record(ev('u', 'hot', 'purchase', 100));
    s.record(ev('u', 'cold', 'view', 200));
    const top = s.trending.top(2);
    expect(top[0].itemId).toBe('hot');
  });

  it('maps rating events to their numeric value', () => {
    const s = new InteractionStream({}, {}, new ManualRecClock());
    const r = s.record(ev('u', 'i', 'rating', 0));
    expect(r.weight).toBe(0); // rating absent → 0
    const r2 = s.record({ userId: 'u', itemId: 'j', kind: 'rating', rating: 4, timestamp: 1 });
    expect(r2.weight).toBe(4);
  });

  it('marks newSession on first event and after gaps', () => {
    const s = new InteractionStream({ sessionGapMs: 1000 }, {}, new ManualRecClock());
    const r1 = s.record(ev('u', 'a', 'view', 0));
    const r2 = s.record(ev('u', 'b', 'view', 500));
    const r3 = s.record(ev('u', 'c', 'view', 5000));
    expect(r1.newSession).toBe(true);
    expect(r2.newSession).toBe(false);
    expect(r3.newSession).toBe(true);
    expect(r3.sessionId).toBeGreaterThan(r2.sessionId);
  });

  it('invokes sinks with events and closed sessions', () => {
    const events: number[] = [];
    const sessions: string[][] = [];
    const s = new InteractionStream(
      { sessionGapMs: 100 },
      {
        sinks: [
          {
            onEvent: (_e, w) => events.push(w),
            onSession: (_u, items) => sessions.push([...items]),
          },
        ],
      },
      new ManualRecClock()
    );
    s.record(ev('u', 'a', 'click', 0));
    s.record(ev('u', 'b', 'view', 50));
    s.flush();
    expect(events).toEqual([2, 1]); // click=2, view=1
    expect(sessions).toEqual([['a', 'b']]);
  });
});
