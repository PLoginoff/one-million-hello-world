/**
 * engine2 ServiceLevelAggregator tests.
 */

import { describe, it, expect } from 'bun:test';
import type { SpanSnapshot } from '../../engine/Span';
import { ServiceLevelAggregator } from '../../engine2';

let n = 0;
function span(over: Partial<SpanSnapshot> & { spanId: string }): SpanSnapshot {
  n += 1;
  return {
    traceId: 't',
    name: `op${n}`,
    kind: 'server',
    startTimeMs: 0,
    endTimeMs: 10,
    status: { code: 'UNSET' },
    attributes: {},
    events: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    ...over,
  };
}
const svc = (s: string) => ({ 'service.name': s });

describe('ServiceLevelAggregator', () => {
  it('counts only server-kind entry spans', () => {
    const agg = new ServiceLevelAggregator();
    agg.addTrace([
      span({ traceId: 't', spanId: 'a', kind: 'server', attributes: svc('web') }),
      span({ traceId: 't', spanId: 'b', parentSpanId: 'a', kind: 'internal', attributes: svc('web') }),
      span({ traceId: 't', spanId: 'c', parentSpanId: 'a', kind: 'client', attributes: svc('db') }),
    ]);
    const web = agg.report('web')!;
    expect(web.requests).toBe(1); // only the server entry
    expect(agg.report('db')).toBeUndefined(); // client isn't an entry
  });

  it('server span under a different-service parent is an entry', () => {
    const agg = new ServiceLevelAggregator();
    agg.addTrace([
      span({ traceId: 't', spanId: 'a', kind: 'server', attributes: svc('web') }),
      span({ traceId: 't', spanId: 'b', parentSpanId: 'a', kind: 'server', attributes: svc('api') }),
    ]);
    expect(agg.report('api')!.requests).toBe(1);
    expect(agg.report('web')!.requests).toBe(1);
  });

  it('same-service nested server spans do not double-count', () => {
    const agg = new ServiceLevelAggregator();
    agg.addTrace([
      span({ traceId: 't', spanId: 'a', kind: 'server', attributes: svc('web') }),
      span({ traceId: 't', spanId: 'b', parentSpanId: 'a', kind: 'server', attributes: svc('web') }),
    ]);
    expect(agg.report('web')!.requests).toBe(1);
  });

  it('error rate counts ERROR entries', () => {
    const agg = new ServiceLevelAggregator();
    agg.addTrace([
      span({ traceId: 't1', spanId: 'a', kind: 'server', attributes: svc('web'), status: { code: 'ERROR' } }),
      span({ traceId: 't1', spanId: 'b', kind: 'server', attributes: svc('web'), status: { code: 'OK' } }),
    ]);
    const r = agg.report('web')!;
    expect(r.requests).toBe(2);
    expect(r.errors).toBe(1);
    expect(r.errorRate).toBe(0.5);
  });

  it('duration quantiles interpolate inside le-buckets', () => {
    const agg = new ServiceLevelAggregator();
    // 100 spans: 50 at ~10ms, 40 at ~100ms, 10 at ~1000ms
    const mk = (dur: number, i: number) =>
      span({ traceId: `t${i}`, spanId: `s${n}-${i}`, kind: 'server', attributes: svc('svc'), startTimeMs: 0, endTimeMs: dur });
    const spans: SpanSnapshot[] = [];
    for (let i = 0; i < 50; i++) spans.push(mk(10, i));
    for (let i = 50; i < 90; i++) spans.push(mk(100, i));
    for (let i = 90; i < 100; i++) spans.push(mk(1_000, i));
    agg.addTrace(spans);
    const r = agg.report('svc')!;
    expect(r.p50Ms).toBeLessThanOrEqual(25); // 50th percentile in the ≤25ms bucket
    expect(r.p90Ms).toBeGreaterThan(50);
    expect(r.p99Ms).toBeGreaterThan(500);
  });

  it('requestsPerMinute normalizes to the observed window', () => {
    const agg = new ServiceLevelAggregator();
    agg.addTrace([
      span({ traceId: 't', spanId: 'a', kind: 'server', attributes: svc('s'), startTimeMs: 0, endTimeMs: 10 }),
      span({ traceId: 't', spanId: 'b', kind: 'server', attributes: svc('s'), startTimeMs: 60_000, endTimeMs: 60_010 }),
    ]);
    const r = agg.report('s')!;
    // 2 requests in 60s ≈ 2 rpm.
    expect(r.requestsPerMinute).toBeCloseTo(2, 1);
  });
});
