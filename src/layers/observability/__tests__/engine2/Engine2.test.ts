/**
 * Observability engine2 tests — rollup, alert evaluation, SLO, cost.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../engine';
import {
  AlertEvaluator,
  AlertRule,
  MetricRollup,
  SloTracker,
  TelemetryCostEstimator,
  bucketStart,
} from '../../engine2';

const MIN = 60_000;
const HOUR = 3_600_000;

// ------------------------------------------------------------------ rollup

describe('MetricRollup', () => {
  let r: MetricRollup;
  beforeEach(() => {
    r = new MetricRollup('minute');
  });

  it('buckets samples by floor(ts/minute)', () => {
    expect(bucketStart(90_000, 'minute')).toBe(MIN);
    r.recordAll('cpu', [
      { timestampMs: 1_000, value: 10 },
      { timestampMs: 59_000, value: 20 },
      { timestampMs: 61_000, value: 30 },
    ]);
    const s = r.series('cpu', undefined, 'avg');
    expect(s.length).toBe(2);
    expect(s[0].bucketStartMs).toBe(0);
    expect(s[0].value).toBe(15);
    expect(s[0].sampleCount).toBe(2);
    expect(s[1].bucketStartMs).toBe(MIN);
    expect(s[1].value).toBe(30);
  });

  it('separates series by name + attribute set', () => {
    r.record('cpu', { timestampMs: 1, value: 1, attributes: { host: 'a' } });
    r.record('cpu', { timestampMs: 2, value: 2, attributes: { host: 'b' } });
    r.record('mem', { timestampMs: 3, value: 9, attributes: { host: 'a' } });
    expect(r.seriesKeys().length).toBe(3);
    expect(r.series('cpu', { host: 'a' })[0].value).toBe(1);
    expect(r.series('cpu', { host: 'b' })[0].value).toBe(2);
  });

  it('supports min/max/sum/last/count aggregates', () => {
    r.recordAll('m', [
      { timestampMs: 0, value: 5 },
      { timestampMs: 10_000, value: 15 },
      { timestampMs: 20_000, value: 10 },
    ]);
    expect(r.series('m', undefined, 'min')[0].value).toBe(5);
    expect(r.series('m', undefined, 'max')[0].value).toBe(15);
    expect(r.series('m', undefined, 'sum')[0].value).toBe(30);
    expect(r.series('m', undefined, 'last')[0].value).toBe(10);
    expect(r.series('m', undefined, 'count')[0].value).toBe(3);
  });

  it('out-of-order samples land in the right bucket and order', () => {
    r.record('m', { timestampMs: 30_000, value: 2 });
    r.record('m', { timestampMs: 5_000, value: 1 }); // earlier, same bucket
    const s = r.series('m', undefined, 'last');
    expect(s[0].value).toBe(2); // last by timestamp, not arrival
    expect(s[0].firstMs).toBe(5_000);
    expect(s[0].lastMs).toBe(30_000);
  });

  it('fillGaps materializes zero buckets between extremes', () => {
    r.record('m', { timestampMs: 0, value: 1 });
    r.record('m', { timestampMs: 3 * MIN + 1, value: 4 });
    const s = r.series('m', undefined, 'avg', { fillGaps: true });
    expect(s.length).toBe(4);
    expect(s[1].sampleCount).toBe(0);
    expect(s[1].value).toBe(0);
  });

  it('absorbRollup folds a minute rollup into an hour rollup weighted', () => {
    const minute = new MetricRollup('minute');
    for (let i = 0; i < 60; i++) {
      minute.record('m', { timestampMs: i * 1_000, value: 2 }); // bucket 0: avg 2, n=60
    }
    for (let i = 0; i < 30; i++) {
      minute.record('m', { timestampMs: MIN + i * 1_000, value: 4 }); // bucket 1: avg 4, n=30
    }
    const hour = new MetricRollup('hour');
    hour.absorbRollup(minute, 'avg');
    const s = hour.series('m', undefined, 'avg');
    expect(s.length).toBe(1);
    expect(s[0].sampleCount).toBe(90);
    // (2*60 + 4*30) / 90 = 240/90 ≈ 2.6667
    expect(s[0].value).toBeCloseTo(240 / 90, 6);
  });

  it('prune drops buckets older than retention', () => {
    r.record('m', { timestampMs: 0, value: 1 });
    r.record('m', { timestampMs: 5 * MIN, value: 2 });
    expect(r.prune(4 * MIN)).toBe(1);
    expect(r.series('m', undefined).length).toBe(1);
  });
});

// ------------------------------------------------------------ alert rules

describe('AlertEvaluator', () => {
  let clock: ManualClock;
  let ev: AlertEvaluator;
  const rule: AlertRule = {
    id: 'high-cpu',
    metric: 'cpu',
    comparator: 'gt',
    threshold: 80,
    forDurationMs: 2 * MIN,
    severity: 'critical',
  };

  beforeEach(() => {
    clock = new ManualClock(0);
    ev = new AlertEvaluator(clock);
    ev.registerRule(rule);
  });

  it('pending → firing only after continuous for-duration', () => {
    // Breach starts at t=0.
    let t = ev.evaluate('cpu', { value: 90, timestampMs: 0 });
    expect(t).toEqual([{ ruleId: 'high-cpu', seriesKey: '', from: 'ok', to: 'pending', value: 90, atMs: 0 }]);
    // Still breaching at 1min — not yet 2min.
    t = ev.evaluate('cpu', { value: 91, timestampMs: MIN });
    expect(t).toEqual([]);
    expect(ev.instances()[0].state).toBe('pending');
    // At 2min the for-duration is met.
    t = ev.evaluate('cpu', { value: 92, timestampMs: 2 * MIN });
    expect(t[0].to).toBe('firing');
    expect(t[0].from).toBe('pending');
  });

  it('a clear while pending resets the timer', () => {
    ev.evaluate('cpu', { value: 90, timestampMs: 0 });
    ev.evaluate('cpu', { value: 50, timestampMs: MIN }); // clears
    const t = ev.evaluate('cpu', { value: 95, timestampMs: 2 * MIN });
    // New breach — timer restarts, so state is pending again (not firing).
    expect(ev.instances()[0].state).toBe('pending');
    expect(t[0].from).toBe('ok');
    expect(t[0].to).toBe('pending');
  });

  it('forDurationMs=0 fires immediately', () => {
    ev.registerRule({ ...rule, id: 'now', forDurationMs: 0 });
    const t = ev.evaluate('cpu', { value: 81, timestampMs: 0 });
    const fire = t.find((x) => x.ruleId === 'now');
    expect(fire?.to).toBe('firing');
  });

  it('resolveAfterMs keeps the alert firing through brief clears', () => {
    ev.registerRule({
      ...rule,
      id: 'sticky',
      forDurationMs: 0,
      resolveAfterMs: 2 * MIN,
    });
    ev.evaluate('cpu', { value: 99, timestampMs: 0 });
    expect(ev.firing().length).toBe(1);
    // Brief clear — inside resolveAfter, stays firing.
    ev.evaluate('cpu', { value: 10, timestampMs: MIN });
    expect(ev.instances().find((i) => i.ruleId === 'sticky')?.state).toBe('firing');
    // Clear held for 2min — resolves.
    ev.evaluate('cpu', { value: 10, timestampMs: 3 * MIN });
    expect(ev.instances().find((i) => i.ruleId === 'sticky')?.state).toBe('ok');
  });

  it('matchAttributes scopes the rule to a subset series', () => {
    ev.registerRule({
      ...rule,
      id: 'prod-only',
      forDurationMs: 0,
      matchAttributes: { env: 'prod' },
    });
    ev.evaluate('cpu', { value: 99, attributes: { env: 'dev' }, timestampMs: 0 });
    expect(ev.firing().filter((i) => i.ruleId === 'prod-only').length).toBe(0);
    ev.evaluate('cpu', { value: 99, attributes: { env: 'prod' }, timestampMs: MIN });
    expect(ev.firing().filter((i) => i.ruleId === 'prod-only').length).toBe(1);
  });

  it('same metric, different attribute sets → independent state', () => {
    const r0: AlertRule = { ...rule, id: 'per-host', forDurationMs: 0 };
    ev.registerRule(r0);
    ev.evaluate('cpu', { value: 99, attributes: { host: 'a' }, timestampMs: 0 });
    ev.evaluate('cpu', { value: 1, attributes: { host: 'b' }, timestampMs: 0 });
    const firing = ev.firing().filter((i) => i.ruleId === 'per-host');
    expect(firing.length).toBe(1);
    expect(firing[0].seriesKey).toBe('host=a');
  });

  it('transition log records the full state history', () => {
    ev.evaluate('cpu', { value: 90, timestampMs: 0 });
    ev.evaluate('cpu', { value: 90, timestampMs: 2 * MIN });
    ev.evaluate('cpu', { value: 10, timestampMs: 3 * MIN });
    const kinds = ev.transitions().map((t) => `${t.from}>${t.to}`);
    expect(kinds).toEqual(['ok>pending', 'pending>firing', 'firing>ok']);
  });
});

// -------------------------------------------------------------------- SLO

describe('SloTracker', () => {
  let clock: ManualClock;
  let st: SloTracker;
  const WINDOW = 30 * MIN;

  beforeEach(() => {
    clock = new ManualClock(WINDOW); // window edge starts at 0
    st = new SloTracker(clock);
    st.registerSlo({ id: 'avail', name: 'availability', target: 0.99, windowMs: WINDOW });
  });

  it('perfect run keeps budget full, burnRate 0', () => {
    st.record('avail', 'good', 1000);
    const s = st.snapshot('avail');
    expect(s.observedRatio).toBe(0);
    expect(s.budgetRemaining).toBe(1);
    expect(s.burnRate).toBe(0);
  });

  it('bad events consume budget proportionally', () => {
    st.record('avail', 'good', 990);
    st.record('avail', 'bad', 10);
    const s = st.snapshot('avail');
    expect(s.observedRatio).toBeCloseTo(0.01, 9);
    // allowed ratio = 0.01 → burnRate = 1.0 exactly
    expect(s.burnRate).toBeCloseTo(1, 9);
    expect(s.budgetRemaining).toBeCloseTo(0, 9);
  });

  it('burn rate >1 means over-budget pace', () => {
    st.record('avail', 'good', 980);
    st.record('avail', 'bad', 20); // 2% errors vs 1% allowed
    const s = st.snapshot('avail');
    expect(s.burnRate).toBeCloseTo(2, 9);
    expect(s.budgetRemaining).toBeCloseTo(-1, 9); // overdrawn
  });

  it('rolling window evicts stale events', () => {
    // 100 bad events at t=0.
    st.record('avail', 'bad', 100, 0);
    let s = st.snapshot('avail', WINDOW);
    expect(s.totalEvents).toBe(100);
    // Slide past the window — all events fall out.
    s = st.snapshot('avail', 2 * WINDOW);
    expect(s.totalEvents).toBe(0);
    expect(s.budgetRemaining).toBe(1);
  });

  it('rejects degenerate targets', () => {
    expect(() =>
      st.registerSlo({ id: 'x', name: 'x', target: 1.0, windowMs: MIN }),
    ).toThrow();
    expect(() =>
      st.registerSlo({ id: 'y', name: 'y', target: 0, windowMs: MIN }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------- cost

describe('TelemetryCostEstimator', () => {
  let clock: ManualClock;
  let est: TelemetryCostEstimator;

  beforeEach(() => {
    clock = new ManualClock(0);
    est = new TelemetryCostEstimator(undefined, clock);
  });

  it('projects per-hour cost from an observed window', () => {
    const t1 = HOUR;
    est.report({ kind: 'metric', units: 3600, bytes: 0, windowMs: HOUR });
    clock.set(t1);
    const e = est.estimate();
    // observed window covers ~1 hour of metered volume
    const metricLine = e.lines.find((l) => l.kind === 'metric');
    expect(metricLine?.units).toBe(3600);
    expect(metricLine?.cost).toBeCloseTo(3600 * 0.000_001, 9);
  });

  it('log billing includes record + byte charges', () => {
    const c = new TelemetryCostEstimator(
      { perMetricPoint: 0, perLogRecord: 1, perLogByte: 0.5, perSpan: 0 },
      clock,
    );
    c.ingest({ kind: 'log', timestampMs: 0, attributes: {}, body: 'abcd' });
    const e = c.estimate();
    const log = e.lines.find((l) => l.kind === 'log');
    // 1 record × 1 + 4 bytes × 0.5 = 3
    expect(log?.cost).toBe(3);
  });

  it('shareOfTotal ranks the dominant signal', () => {
    est.report({ kind: 'trace', units: 1000, bytes: 0, windowMs: MIN });
    est.report({ kind: 'metric', units: 10, bytes: 0, windowMs: MIN });
    const e = est.estimate(MIN);
    const trace = e.lines.find((l) => l.kind === 'trace');
    expect(trace!.shareOfTotal).toBeGreaterThan(0.99);
  });

  it('empty estimator reports zero, not NaN', () => {
    const e = est.estimate();
    expect(e.totalCost).toBe(0);
    expect(e.projectedCostPerHour).toBe(0);
    for (const l of e.lines) expect(l.shareOfTotal).toBe(0);
  });
});
