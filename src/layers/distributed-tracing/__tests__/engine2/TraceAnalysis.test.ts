/**
 * Distributed-tracing engine2 tests — tail rules, links, critical path, search.
 */

import { describe, it, expect } from 'bun:test';
import type { SpanSnapshot } from '../../engine/Span';
import {
  criticalPath,
  matchesQuery,
  SpanLinkAnalyzer,
  summarize,
  TailRuleEngine,
  TraceStore,
  traceWallClock,
} from '../../engine2';

let counter = 0;
function span(over: Partial<SpanSnapshot> & { spanId: string }): SpanSnapshot {
  counter += 1;
  return {
    traceId: 'trace-1',
    name: `op-${counter}`,
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

function svc(name: string) {
  return { 'service.name': name };
}

// A simple trace: web (root, 0-100) → api (10-90) → db (20-80).
function sampleTrace(traceId = 't1'): SpanSnapshot[] {
  return [
    span({ traceId, spanId: 'a', name: 'GET /', startTimeMs: 0, endTimeMs: 100, attributes: svc('web') }),
    span({ traceId, spanId: 'b', parentSpanId: 'a', name: 'handler', startTimeMs: 10, endTimeMs: 90, attributes: svc('api') }),
    span({ traceId, spanId: 'c', parentSpanId: 'b', name: 'SELECT', kind: 'client', startTimeMs: 20, endTimeMs: 80, attributes: svc('db') }),
  ];
}

// ------------------------------------------------------------- tail rules

describe('TailRuleEngine', () => {
  it('keeps traces above a latency threshold', () => {
    const eng = new TailRuleEngine([
      { kind: 'latency-above', decision: 'keep', thresholdMs: 50, name: 'slow' },
    ]);
    const d = eng.decide('t1', sampleTrace());
    expect(d.keep).toBe(true);
    expect(d.rule).toBe('slow');
    expect(d.reason).toContain('100ms >= 50ms');
  });

  it('drops fast traces when the rule does not match', () => {
    const eng = new TailRuleEngine([
      { kind: 'latency-above', decision: 'keep', thresholdMs: 1000 },
    ]);
    expect(eng.decide('t1', sampleTrace()).keep).toBe(false);
  });

  it('has-error keeps error traces regardless of latency', () => {
    const eng = new TailRuleEngine([
      { kind: 'has-error', decision: 'keep', name: 'errors' },
      { kind: 'latency-above', decision: 'keep', thresholdMs: 500 },
    ]);
    const fast = [
      span({ traceId: 't2', spanId: 'a', startTimeMs: 0, endTimeMs: 5, status: { code: 'ERROR', message: 'boom' } }),
    ];
    const d = eng.decide('t2', fast);
    expect(d.keep).toBe(true);
    expect(d.rule).toBe('errors');
  });

  it('first matching rule wins (rule order matters)', () => {
    const eng = new TailRuleEngine([
      { kind: 'service', decision: 'drop', serviceName: 'db', name: 'no-db' },
      { kind: 'has-error', decision: 'keep' },
    ]);
    const tr = [
      span({ traceId: 't3', spanId: 'a', attributes: svc('web'), status: { code: 'ERROR' } }),
      span({ traceId: 't3', spanId: 'b', parentSpanId: 'a', attributes: svc('db') }),
    ];
    expect(eng.decide('t3', tr).rule).toBe('no-db');
    expect(eng.decide('t3', tr).keep).toBe(false);
  });

  it('attribute-eq rule matches on any span attribute', () => {
    const eng = new TailRuleEngine([
      { kind: 'attribute-eq', decision: 'keep', attributeKey: 'user.tier', attributeValue: 'vip' },
    ]);
    const tr = [
      span({ traceId: 't4', spanId: 'a', attributes: { 'user.tier': 'vip' } }),
    ];
    expect(eng.decide('t4', tr).keep).toBe(true);
  });

  it('default applies when nothing matches', () => {
    const eng = new TailRuleEngine([{ kind: 'has-error', decision: 'keep' }], true);
    const d = eng.decide('t5', [span({ traceId: 't5', spanId: 'a', status: { code: 'OK' } })]);
    expect(d.rule).toBe('default');
    expect(d.keep).toBe(true);
  });
});

// ----------------------------------------------------------- link analysis

describe('SpanLinkAnalyzer', () => {
  it('builds cross-service edges from parent/child', () => {
    const la = new SpanLinkAnalyzer();
    la.addTrace(sampleTrace());
    const r = la.report();
    expect(r.edges.length).toBe(2);
    const web2api = r.edges.find((e) => e.callerService === 'web' && e.calleeService === 'api');
    const api2db = r.edges.find((e) => e.callerService === 'api' && e.calleeService === 'db');
    expect(web2api?.calls).toBe(1);
    expect(api2db?.calls).toBe(1);
    expect(api2db?.totalLatencyMs).toBe(60);
  });

  it('intra-service nesting does not create an edge', () => {
    const la = new SpanLinkAnalyzer();
    la.addTrace([
      span({ traceId: 'x', spanId: 'a', attributes: svc('web') }),
      span({ traceId: 'x', spanId: 'b', parentSpanId: 'a', attributes: svc('web') }),
    ]);
    expect(la.report().edges.length).toBe(0);
  });

  it('fan-in / fan-out count distinct neighbours', () => {
    const la = new SpanLinkAnalyzer();
    la.addTrace(sampleTrace('t1'));
    la.addTrace([
      span({ traceId: 't2', spanId: 'a', attributes: svc('mobile') }),
      span({ traceId: 't2', spanId: 'b', parentSpanId: 'a', attributes: svc('api') }),
    ]);
    const r = la.report();
    const api = r.nodes.find((n) => n.service === 'api');
    expect(api?.fanIn).toBe(2); // web + mobile
    expect(api?.fanOut).toBe(1); // db
  });

  it('selfTime subtracts covered child windows', () => {
    const la = new SpanLinkAnalyzer();
    la.addTrace(sampleTrace());
    const r = la.report();
    const web = r.nodes.find((n) => n.service === 'web');
    const api = r.nodes.find((n) => n.service === 'api');
    // web: 100 - child(b) [10,90]=80 → 20; api: 80 - child(c) [20,80]=60 → 20
    expect(web?.selfTimeMs).toBe(20);
    expect(api?.selfTimeMs).toBe(20);
  });

  it('counts errors on edges', () => {
    const la = new SpanLinkAnalyzer();
    la.addTrace([
      span({ traceId: 'e', spanId: 'a', attributes: svc('web'), status: { code: 'ERROR' } }),
      span({ traceId: 'e', spanId: 'b', parentSpanId: 'a', attributes: svc('api'), status: { code: 'ERROR' } }),
    ]);
    const edge = la.report().edges[0];
    expect(edge.errors).toBe(1);
  });
});

// ---------------------------------------------------------- critical path

describe('criticalPath', () => {
  it('walks root → last-ending child chain', () => {
    const cp = criticalPath('t1', sampleTrace());
    expect(cp.steps.map((s) => s.service)).toEqual(['web', 'api', 'db']);
    expect(cp.wallClockMs).toBe(100);
    expect(cp.workMs).toBe(100 + 80 + 60);
  });

  it('prefers the later-ending sibling, not the earlier one', () => {
    const tr = [
      span({ traceId: 'p', spanId: 'root', startTimeMs: 0, endTimeMs: 100, attributes: svc('a') }),
      span({ traceId: 'p', spanId: 'short', parentSpanId: 'root', startTimeMs: 0, endTimeMs: 10, attributes: svc('b') }),
      span({ traceId: 'p', spanId: 'long', parentSpanId: 'root', startTimeMs: 50, endTimeMs: 95, attributes: svc('c') }),
    ];
    const cp = criticalPath('p', tr);
    expect(cp.steps.map((s) => s.spanId)).toEqual(['root', 'long']);
  });

  it('coverage is work / wall-clock', () => {
    const cp = criticalPath('t1', sampleTrace());
    expect(cp.coverage).toBeCloseTo((100 + 80 + 60) / 100, 9);
  });

  it('records wait time before a delayed child starts', () => {
    const tr = [
      span({ traceId: 'w', spanId: 'root', startTimeMs: 0, endTimeMs: 100, attributes: svc('a') }),
      span({ traceId: 'w', spanId: 'child', parentSpanId: 'root', startTimeMs: 60, endTimeMs: 100, attributes: svc('a') }),
    ];
    const cp = criticalPath('w', tr);
    expect(cp.steps[1].waitMs).toBe(60);
  });
});

// ------------------------------------------------------------- trace search

describe('TraceStore + search', () => {
  it('summarize reports services, span count, error flag', () => {
    const s = summarize('t1', sampleTrace());
    expect(s.services).toEqual(['api', 'db', 'web']);
    expect(s.spanCount).toBe(3);
    expect(s.durationMs).toBe(100);
    expect(s.hasError).toBe(false);
    expect(s.rootName).toBe('GET /');
  });

  it('finds traces by service + min duration', () => {
    const st = new TraceStore();
    st.put(sampleTrace('slow'));
    st.put([span({ traceId: 'fast', spanId: 'a', attributes: svc('api'), startTimeMs: 0, endTimeMs: 5 })]);
    const hits = st.search({ service: 'api', minDurationMs: 50 });
    expect(hits.map((h) => h.traceId)).toEqual(['slow']);
  });

  it('matchesQuery requires all attribute pairs present', () => {
    const tr = [
      span({ traceId: 'q', spanId: 'a', attributes: { 'http.route': '/pay', 'user.tier': 'vip' } }),
    ];
    expect(matchesQuery('q', tr, { attributes: { 'http.route': '/pay' } })).toBe(true);
    expect(matchesQuery('q', tr, { attributes: { 'http.route': '/pay', 'user.tier': 'basic' } })).toBe(false);
  });

  it('status=ERROR finds traces with any error span', () => {
    const tr = [
      span({ traceId: 'e', spanId: 'a' }),
      span({ traceId: 'e', spanId: 'b', parentSpanId: 'a', status: { code: 'ERROR' } }),
    ];
    expect(matchesQuery('e', tr, { status: 'ERROR' })).toBe(true);
  });

  it('operation + max duration narrow the result', () => {
    const st = new TraceStore();
    st.put(sampleTrace('x'));
    const hits = st.search({ operation: 'SELECT', maxDurationMs: 150 });
    expect(hits.length).toBe(1);
    expect(st.search({ operation: 'SELECT', maxDurationMs: 50 }).length).toBe(0);
  });

  it('traceWallClock spans the whole envelope', () => {
    const tr = [
      span({ traceId: 'w', spanId: 'a', startTimeMs: 50, endTimeMs: 60 }),
      span({ traceId: 'w', spanId: 'b', startTimeMs: 10, endTimeMs: 200 }),
    ];
    expect(traceWallClock(tr)).toBe(190);
  });
});
