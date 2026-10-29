/**
 * Span model tests — lifecycle, kinds, status, events, clock-skew.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  BatchSpanProcessor,
  ContextPropagator,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  Span,
  SpanSnapshot,
  SpanTree,
  Tracer,
  clampToParent,
} from '../../engine';

function makeTracer(clock: ManualClock) {
  const exporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(exporter);
  const tracer = new Tracer('svc-a', () => clock.nowMs(), (s) => processor.onEnd(s));
  return { tracer, exporter, processor };
}

function snapshot(p: Partial<SpanSnapshot> & { spanId: string }): SpanSnapshot {
  return {
    traceId: 't',
    parentSpanId: undefined,
    name: 'op',
    kind: 'internal',
    startTimeMs: 0,
    endTimeMs: 10,
    status: { code: 'UNSET' },
    attributes: {},
    events: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    ...p,
  };
}

describe('Span lifecycle', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = new ManualClock(1_000);
  });

  it('records start/end from the clock', async () => {
    const { tracer, exporter, processor } = makeTracer(clock);
    const span = tracer.startSpan('op');
    clock.advance(50);
    tracer.endSpan(span);
    await processor.flush();
    const s = exporter.allSpans()[0];
    expect(s.startTimeMs).toBe(1_000);
    expect(s.endTimeMs).toBe(1_050);
  });

  it('setAttribute/addEvent work before end and no-op after', () => {
    const { tracer } = makeTracer(clock);
    const span = tracer.startSpan('op');
    span.setAttribute('k', 'v');
    span.addEvent('e1');
    tracer.endSpan(span);
    span.setAttribute('late', 'nope');
    span.addEvent('e2');
    const s = span.snapshot();
    expect(s.attributes['k']).toBe('v');
    expect(s.attributes['late']).toBeUndefined();
    expect(s.events.length).toBe(1);
  });

  it('recordException sets ERROR status + exception event', () => {
    const { tracer } = makeTracer(clock);
    const span = tracer.startSpan('op');
    span.recordException(new TypeError('boom'));
    const s = tracer.endSpan(span);
    expect(s.status.code).toBe('ERROR');
    expect(s.status.message).toBe('boom');
    const ev = s.events.find((e) => e.name === 'exception');
    expect(ev).toBeDefined();
    expect(ev?.attributes['exception.type']).toBe('TypeError');
  });

  it('ERROR status cannot be overwritten by OK', () => {
    const { tracer } = makeTracer(clock);
    const span = tracer.startSpan('op');
    span.setStatus('ERROR', 'bad');
    span.setStatus('OK');
    expect(span.snapshot().status.code).toBe('ERROR');
  });

  it('withSpan records exceptions and rethrows', async () => {
    const { tracer } = makeTracer(clock);
    await expect(
      tracer.withSpan('op', {}, async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');
  });

  it('withSpan marks OK when body completes without status', async () => {
    const { tracer, exporter, processor } = makeTracer(clock);
    await tracer.withSpan('op', {}, async () => 'done');
    await processor.flush();
    expect(exporter.allSpans()[0].status.code).toBe('OK');
  });

  it('drops attributes beyond the limit', () => {
    const span = new Span('op', 't', 's', undefined, () => 0, { attributeLimit: 2 });
    span.setAttribute('a', 1).setAttribute('b', 2).setAttribute('c', 3);
    const s = span.snapshot();
    expect(Object.keys(s.attributes).length).toBe(2);
    expect(s.droppedAttributesCount).toBe(1);
  });

  it('respects span kinds and parent ids', () => {
    const { tracer } = makeTracer(clock);
    const root = tracer.startSpan('server', { kind: 'server' });
    const child = tracer.startSpan('client', {
      kind: 'client',
      parent: { traceId: root.traceId, spanId: root.spanId },
    });
    expect(child.traceId).toBe(root.traceId);
    expect(child.parentSpanId).toBe(root.spanId);
    expect(child.kind).toBe('client');
  });
});

describe('SpanTree / clock skew', () => {
  it('builds parent-child relationships', () => {
    const tree = new SpanTree([
      snapshot({ spanId: 'root' }),
      snapshot({ spanId: 'c1', parentSpanId: 'root' }),
      snapshot({ spanId: 'c2', parentSpanId: 'root' }),
    ]);
    expect(tree.roots.length).toBe(1);
    expect(tree.childrenOf('root').length).toBe(2);
  });

  it('clamps a child that started before its parent', () => {
    const parent = snapshot({ spanId: 'p', startTimeMs: 100, endTimeMs: 200 });
    const child = snapshot({ spanId: 'c', parentSpanId: 'p', startTimeMs: 50, endTimeMs: 150 });
    const out = clampToParent(child, parent);
    expect(out.startTimeMs).toBe(100);
    expect(out.endTimeMs).toBe(200); // duration preserved: 100..200
  });

  it('clamps a child that ended after its parent', () => {
    const parent = snapshot({ spanId: 'p', startTimeMs: 100, endTimeMs: 200 });
    const child = snapshot({ spanId: 'c', parentSpanId: 'p', startTimeMs: 150, endTimeMs: 250 });
    const out = clampToParent(child, parent);
    expect(out.endTimeMs).toBe(200);
    expect(out.startTimeMs).toBe(100);
  });

  it('pins an over-long child to the parent interval', () => {
    const parent = snapshot({ spanId: 'p', startTimeMs: 100, endTimeMs: 200 });
    const child = snapshot({ spanId: 'c', parentSpanId: 'p', startTimeMs: 0, endTimeMs: 500 });
    const out = clampToParent(child, parent);
    expect(out.startTimeMs).toBe(100);
    expect(out.endTimeMs).toBe(200);
  });

  it('leaves already-contained children untouched', () => {
    const parent = snapshot({ spanId: 'p', startTimeMs: 100, endTimeMs: 200 });
    const child = snapshot({ spanId: 'c', parentSpanId: 'p', startTimeMs: 120, endTimeMs: 180 });
    expect(clampToParent(child, parent)).toBe(child); // same reference
  });

  it('correctClockSkew fixes a whole tree in one pass', () => {
    const tree = new SpanTree([
      snapshot({ spanId: 'root', startTimeMs: 100, endTimeMs: 300 }),
      snapshot({ spanId: 'c', parentSpanId: 'root', startTimeMs: 50, endTimeMs: 150 }),
      snapshot({ spanId: 'gc', parentSpanId: 'c', startTimeMs: 30, endTimeMs: 120 }),
    ]);
    const corrected = tree.correctClockSkew();
    const byId = new Map(corrected.map((s) => [s.spanId, s]));
    const c = byId.get('c')!;
    const gc = byId.get('gc')!;
    expect(c.startTimeMs).toBe(100);
    // gc clamped to corrected c bounds
    expect(gc.startTimeMs).toBeGreaterThanOrEqual(c.startTimeMs);
    expect(gc.endTimeMs).toBeLessThanOrEqual(c.endTimeMs);
  });
});

describe('ContextPropagator', () => {
  it('injects and extracts traceparent + baggage', () => {
    const p = new ContextPropagator();
    const carrier: Record<string, string> = {};
    p.inject(carrier, {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      sampled: true,
      baggage: { tenant: 'acme' },
    });
    expect(carrier['traceparent']).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    expect(carrier['baggage']).toBe('tenant=acme');

    const back = p.extract(carrier);
    expect(back?.traceId).toBe('a'.repeat(32));
    expect(back?.sampled).toBe(true);
    expect(back?.baggage['tenant']).toBe('acme');
  });

  it('activate scopes the active context', () => {
    const p = new ContextPropagator();
    expect(p.active()).toBeUndefined();
    p.activate({ traceId: 't', spanId: 's', sampled: true, baggage: {} }, () => {
      expect(p.active()?.traceId).toBe('t');
    });
    expect(p.active()).toBeUndefined();
  });
});
