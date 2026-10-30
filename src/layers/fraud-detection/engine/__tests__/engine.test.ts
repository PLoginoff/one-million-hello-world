/**
 * Fraud-Detection Engine — unit tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  VelocityTracker,
  FraudGraph,
  CaseManager,
  CaseError,
  ModelRegistry,
  ManualFraudClock,
  ScoringModel,
} from '../index';
import { Transaction } from '../../implementations/fraud/Types';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function tx(
  id: string,
  userId: string,
  amount: number,
  t: number,
  extra?: Partial<Transaction>
): Transaction {
  return { id, userId, amount, currency: 'USD', timestamp: t, ...extra };
}

/* ------------------------------------------------------------------ */
/* VelocityTracker                                                      */
/* ------------------------------------------------------------------ */

describe('VelocityTracker', () => {
  let clock: ManualFraudClock;
  let vt: VelocityTracker;

  beforeEach(() => {
    clock = new ManualFraudClock();
    vt = new VelocityTracker(clock);
  });

  it('counts within each window correctly', () => {
    clock.set(10 * DAY);
    vt.track(tx('t1', 'u1', 10, 10 * DAY - 30_000, { metadata: { cardId: 'c1' } }));
    vt.track(tx('t2', 'u1', 20, 10 * DAY - 2 * MIN, { metadata: { cardId: 'c1' } }));
    vt.track(tx('t3', 'u1', 5, 10 * DAY - 2 * HOUR, { metadata: { cardId: 'c1' } }));
    vt.track(tx('t4', 'u1', 50, 10 * DAY - 2 * DAY, { metadata: { cardId: 'c1' } }));
    const f = vt.track(tx('t5', 'u1', 1, 10 * DAY, { metadata: { cardId: 'c1' } }));
    // now=10d: t1 at -30s inside 1m; t2 at -2m inside 1h; t3 at -2h inside 1d; t4 at -2d outside all
    expect(f.count1m).toBe(2);
    expect(f.count1h).toBe(3);
    expect(f.count1d).toBe(4);
    expect(f.sum1h).toBe(31); // t1+t2+t5 inside the hour
  });

  it('tracks each dimension separately', () => {
    clock.set(0);
    vt.track(tx('a', 'u1', 5, 0, { deviceId: 'd1', ipAddress: '10.0.0.1' }));
    vt.track(tx('b', 'u2', 5, 1000, { deviceId: 'd1', ipAddress: '10.0.0.1' }));
    const dev = vt.featuresFor('device', 'd1');
    expect(dev.count1d).toBe(2);
    expect(dev.distinct1d).toBe(2); // two different users on one device
    expect(vt.featuresFor('user', 'u1').count1d).toBe(1);
  });

  it('interArrivalMs is time since previous event', () => {
    clock.set(0);
    vt.track(tx('a', 'u', 1, 0));
    clock.advance(5000);
    vt.track(tx('b', 'u', 1, 5000));
    const f = vt.featuresFor('user', 'u');
    expect(f.interArrivalMs).toBe(0); // last event is "now"
    clock.advance(2000);
    expect(vt.featuresFor('user', 'u').interArrivalMs).toBe(2000);
  });

  it('unknown entities return zeroed features', () => {
    const f = vt.featuresFor('card', 'nope');
    expect(f.count1d).toBe(0);
    expect(f.interArrivalMs).toBe(-1);
  });

  it('prune drops expired history', () => {
    clock.set(0);
    vt.track(tx('a', 'u', 1, 0));
    clock.set(2 * DAY);
    vt.track(tx('b', 'u', 1, 2 * DAY));
    const dropped = vt.prune();
    // 'a' was logged under BOTH card and user dimensions
    expect(dropped).toBe(2);
    expect(vt.featuresFor('user', 'u').count1d).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* FraudGraph                                                           */
/* ------------------------------------------------------------------ */

describe('FraudGraph', () => {
  let g: FraudGraph;
  beforeEach(() => {
    g = new FraudGraph();
  });

  it('finds a ring through shared device', () => {
    g.addEdge('u1', 'device', 'd1');
    g.addEdge('u2', 'device', 'd1');
    const ring = g.ringOf('u1');
    expect(ring).toBeDefined();
    expect(ring!.userIds).toEqual(['u1', 'u2']);
    expect(ring!.sharedAttributes.length).toBe(1);
    expect(ring!.maxDepth).toBe(1); // u1→d1→u2 = 1 user-hop
  });

  it('transitively links via chained attributes', () => {
    g.addEdge('u1', 'device', 'd1');
    g.addEdge('u2', 'device', 'd1');
    g.addEdge('u2', 'card', 'k9');
    g.addEdge('u3', 'card', 'k9');
    const ring = g.ringOf('u1');
    expect(ring!.userIds).toEqual(['u1', 'u2', 'u3']);
    expect(ring!.maxDepth).toBe(2); // u1→d1→u2→k9→u3 = 2 hops
    expect(ring!.riskScore).toBeGreaterThan(0);
  });

  it('no ring for isolated user', () => {
    g.addEdge('u1', 'device', 'd-solo');
    expect(g.ringOf('u1')).toBeUndefined();
  });

  it('usersWithin respects hop depth', () => {
    g.addEdge('u1', 'device', 'd1');
    g.addEdge('u2', 'device', 'd1');
    g.addEdge('u2', 'ip', 'ip1');
    g.addEdge('u3', 'ip', 'ip1');
    expect(g.usersWithin('u1', 1)).toEqual(['u2']);
    expect(g.usersWithin('u1', 2)).toEqual(['u2', 'u3']);
  });

  it('usersOn lists users sharing an attribute', () => {
    g.addEdge('u1', 'ip', 'x');
    g.addEdge('u2', 'ip', 'x');
    g.addEdge('u3', 'ip', 'y');
    expect(g.usersOn('ip', 'x')).toEqual(['u1', 'u2']);
  });
});

/* ------------------------------------------------------------------ */
/* CaseManager                                                          */
/* ------------------------------------------------------------------ */

describe('CaseManager', () => {
  let clock: ManualFraudClock;
  let cm: CaseManager;

  beforeEach(() => {
    clock = new ManualFraudClock();
    cm = new CaseManager(clock);
  });

  it('lifecycle open → investigating → closed', () => {
    const c = cm.open('tx1', 'u1', 80);
    expect(c.state).toBe('open');
    cm.claim(c.id, 'alice');
    const note = cm.addNote(c.id, 'alice', 'called cardholder, no answer');
    expect(note.notes.length).toBe(1);
    const closed = cm.close(c.id, 'fraud');
    expect(closed.state).toBe('closed');
    expect(closed.resolution).toBe('fraud');
  });

  it('next() returns highest-score open case', () => {
    cm.open('t-low', 'u', 10);
    cm.open('t-high', 'u', 90);
    cm.open('t-mid', 'u', 50);
    expect(cm.next()!.transactionId).toBe('t-high');
  });

  it('next() is FIFO on score ties', () => {
    cm.open('t1', 'u', 50);
    clock.advance(1000);
    cm.open('t2', 'u', 50);
    expect(cm.next()!.transactionId).toBe('t1');
  });

  it('rejects claim on non-open case', () => {
    const c = cm.open('tx', 'u', 1);
    cm.claim(c.id, 'a');
    expect(() => cm.claim(c.id, 'b')).toThrow(CaseError);
  });

  it('rejects close on non-investigating case', () => {
    const c = cm.open('tx', 'u', 1);
    expect(() => cm.close(c.id, 'fraud')).toThrow(CaseError);
  });

  it('release returns case to open pool', () => {
    const c = cm.open('tx', 'u', 1);
    cm.claim(c.id, 'a');
    const r = cm.release(c.id);
    expect(r.state).toBe('open');
    expect(r.assignee).toBeUndefined();
    expect(cm.next()!.id).toBe(c.id);
  });

  it('counts tracks states', () => {
    const a = cm.open('t1', 'u', 1);
    cm.open('t2', 'u', 2);
    cm.claim(a.id, 'x');
    const counts = cm.counts();
    expect(counts).toEqual({ open: 1, investigating: 1, closed: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* ModelRegistry                                                        */
/* ------------------------------------------------------------------ */

describe('ModelRegistry', () => {
  const model = (id: string, fn: (tx: Transaction) => number): ScoringModel => ({
    modelId: id,
    score: fn,
  });
  const base = tx('t', 'u', 100, 0);

  it('primary scores drive the result', () => {
    const reg = new ModelRegistry(model('v1', () => 90));
    expect(reg.score(base)).toBe(90);
  });

  it('shadow comparisons record agreement', () => {
    const reg = new ModelRegistry(model('v1', () => 80), { flagThreshold: 50 });
    reg.setShadow(model('v2', () => 60));
    reg.score(base);
    const c = reg.comparisons[0];
    expect(c.primaryDecision).toBe('flag');
    expect(c.shadowDecision).toBe('flag');
    expect(c.disagree).toBe(false);
    expect(c.divergence).toBe(20);
  });

  it('shadow disagreement is detected at the threshold', () => {
    const reg = new ModelRegistry(model('v1', () => 60));
    reg.setShadow(model('v2', () => 30));
    reg.score(base);
    expect(reg.comparisons[0].disagree).toBe(true);
    expect(reg.stats().disagreementRate).toBe(1);
  });

  it('stats summarize divergence', () => {
    const reg = new ModelRegistry(model('v1', () => 50));
    reg.setShadow(model('v2', () => 70));
    reg.score(base);
    reg.score({ ...base, id: 't2' });
    const s = reg.stats();
    expect(s.comparisons).toBe(2);
    expect(s.meanDivergence).toBe(20);
  });

  it('promote swaps primary and clears comparisons', () => {
    const reg = new ModelRegistry(model('v1', () => 10));
    reg.setShadow(model('v2', () => 99));
    reg.score(base);
    reg.promote();
    expect(reg.primary.modelId).toBe('v2');
    expect(reg.shadow).toBeNull();
    expect(reg.comparisons.length).toBe(0);
    expect(reg.score(base)).toBe(99);
  });

  it('promote without shadow throws', () => {
    const reg = new ModelRegistry(model('v1', () => 0));
    expect(() => reg.promote()).toThrow();
  });
});
