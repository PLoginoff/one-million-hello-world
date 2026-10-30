/**
 * engine2 TraceDiff + ErrorAttribution tests.
 */

import { describe, it, expect } from 'bun:test';
import type { SpanSnapshot } from '../../engine/Span';
import { attributeError, diffTraces } from '../../engine2';

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

describe('diffTraces', () => {
  it('matches spans by (service,name,kind) signature', () => {
    const base = [span({ traceId: 'b', spanId: 'b1', name: 'GET /', attributes: svc('web'), endTimeMs: 100 })];
    const cand = [span({ traceId: 'c', spanId: 'c9', name: 'GET /', attributes: svc('web'), endTimeMs: 100 })];
    const d = diffTraces('b', base, 'c', cand);
    expect(d.deltas[0].status).toBe('unchanged');
  });

  it('reports added and removed spans', () => {
    const base = [
      span({ traceId: 'b', spanId: 'b1', name: 'A', attributes: svc('x') }),
      span({ traceId: 'b', spanId: 'b2', name: 'B', attributes: svc('y') }),
    ];
    const cand = [
      span({ traceId: 'c', spanId: 'c1', name: 'A', attributes: svc('x') }),
      span({ traceId: 'c', spanId: 'c2', name: 'C', attributes: svc('z') }),
    ];
    const d = diffTraces('b', base, 'c', cand);
    expect(d.addedSpans).toBe(1);
    expect(d.removedSpans).toBe(1);
    expect(d.deltas.find((x) => x.status === 'added')?.opKey).toContain('C');
    expect(d.deltas.find((x) => x.status === 'removed')?.opKey).toContain('B');
  });

  it('flags slower spans beyond the tolerance', () => {
    const base = [span({ traceId: 'b', spanId: 'b1', name: 'db', attributes: svc('db'), startTimeMs: 0, endTimeMs: 50 })];
    const cand = [span({ traceId: 'c', spanId: 'c1', name: 'db', attributes: svc('db'), startTimeMs: 0, endTimeMs: 200 })];
    const d = diffTraces('b', base, 'c', cand, { durationToleranceMs: 10 });
    expect(d.deltas[0].status).toBe('slower');
    expect(d.deltas[0].deltaMs).toBe(150);
    expect(d.slowerSpans).toBe(1);
    expect(d.wallClockDeltaMs).toBe(150);
  });

  it('status change beats duration delta', () => {
    const base = [span({ traceId: 'b', spanId: 'b1', name: 'op', attributes: svc('x'), status: { code: 'OK' } })];
    const cand = [span({ traceId: 'c', spanId: 'c1', name: 'op', attributes: svc('x'), status: { code: 'ERROR' }, endTimeMs: 500 })];
    const d = diffTraces('b', base, 'c', cand);
    expect(d.deltas[0].status).toBe('status-changed');
  });

  it('duplicate ops pair in start order', () => {
    const base = [
      span({ traceId: 'b', spanId: 'b1', name: 'q', attributes: svc('db'), startTimeMs: 0, endTimeMs: 10 }),
      span({ traceId: 'b', spanId: 'b2', name: 'q', attributes: svc('db'), startTimeMs: 20, endTimeMs: 30 }),
    ];
    const cand = [
      span({ traceId: 'c', spanId: 'c1', name: 'q', attributes: svc('db'), startTimeMs: 0, endTimeMs: 10 }),
      span({ traceId: 'c', spanId: 'c2', name: 'q', attributes: svc('db'), startTimeMs: 20, endTimeMs: 80 }),
    ];
    const d = diffTraces('b', base, 'c', cand);
    const slower = d.deltas.filter((x) => x.status === 'slower');
    expect(slower.length).toBe(1);
    expect(slower[0].deltaMs).toBe(50);
  });
});

describe('attributeError', () => {
  it('no errors → no attribution', () => {
    const r = attributeError('t', [span({ traceId: 't', spanId: 'a' })]);
    expect(r.originSpanId).toBeUndefined();
    expect(r.errorChain.length).toBe(0);
  });

  it('deepest ERROR span with no ERROR parent is the origin', () => {
    const tr = [
      span({ traceId: 't', spanId: 'root', name: 'web', attributes: svc('web'), status: { code: 'ERROR' }, startTimeMs: 0, endTimeMs: 100 }),
      span({ traceId: 't', spanId: 'mid', parentSpanId: 'root', name: 'api', attributes: svc('api'), status: { code: 'ERROR' }, startTimeMs: 10, endTimeMs: 90 }),
      span({ traceId: 't', spanId: 'leaf', parentSpanId: 'mid', name: 'db', attributes: svc('db'), status: { code: 'ERROR' }, startTimeMs: 20, endTimeMs: 80 }),
    ];
    const r = attributeError('t', tr);
    expect(r.originSpanId).toBe('leaf');
    expect(r.originService).toBe('db');
    expect(r.propagatedSpanIds.sort()).toEqual(['mid', 'root']);
  });

  it('an explicit exception event pins the origin even if shallower', () => {
    const tr = [
      span({ traceId: 't', spanId: 'a', status: { code: 'ERROR' } }),
      span({
        traceId: 't',
        spanId: 'b',
        parentSpanId: 'a',
        status: { code: 'ERROR' },
        events: [{ name: 'exception', timestampMs: 0, attributes: {} }],
      }),
      span({ traceId: 't', spanId: 'c', parentSpanId: 'b', status: { code: 'ERROR' } }),
    ];
    const r = attributeError('t', tr);
    expect(r.originSpanId).toBe('b');
  });
});
