/**
 * Span processor tests — batching, queue overflow, retries.
 */

import { describe, it, expect } from 'bun:test';
import { ManualClock } from '../../../observability/engine/signals';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  SpanSnapshot,
} from '../../engine';

function snap(id: string): SpanSnapshot {
  return {
    traceId: 't',
    spanId: id,
    name: 'op',
    kind: 'internal',
    startTimeMs: 0,
    endTimeMs: 10,
    status: { code: 'OK' },
    attributes: {},
    events: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
  };
}

describe('BatchSpanProcessor', () => {
  it('flushes when the batch fills', async () => {
    const exporter = new InMemorySpanExporter();
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 3, scheduleDelayMs: 0, maxQueueSize: 100 },
      new ManualClock(0)
    );
    proc.onEnd(snap('1'));
    proc.onEnd(snap('2'));
    expect(proc.queueSize()).toBe(2);
    proc.onEnd(snap('3'));
    await proc.flush();
    expect(exporter.allSpans().length).toBe(3);
    expect(proc.queueSize()).toBe(0);
  });

  it('splits large drains into maxBatchSize chunks', async () => {
    const exporter = new InMemorySpanExporter();
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 5, scheduleDelayMs: 0, maxQueueSize: 100 },
      new ManualClock(0)
    );
    for (let i = 0; i < 12; i++) proc.onEnd(snap(String(i)));
    await proc.flush();
    expect(exporter.batches.map((b) => b.length)).toEqual([5, 5, 2]);
  });

  it('drop-oldest evicts the oldest queued span on overflow', async () => {
    const dropped: string[] = [];
    const exporter = new InMemorySpanExporter();
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 100, scheduleDelayMs: 0, maxQueueSize: 3, dropPolicy: 'drop-oldest' },
      new ManualClock(0),
      [],
      (spans, reason) => {
        expect(reason).toContain('oldest');
        dropped.push(...spans.map((s) => s.spanId));
      }
    );
    proc.onEnd(snap('a'));
    proc.onEnd(snap('b'));
    proc.onEnd(snap('c'));
    proc.onEnd(snap('d')); // overflows, evicts 'a'
    expect(dropped).toEqual(['a']);
    await proc.flush();
    expect(exporter.allSpans().map((s) => s.spanId)).toEqual(['b', 'c', 'd']);
  });

  it('drop-newest rejects the incoming span', async () => {
    const dropped: string[] = [];
    const exporter = new InMemorySpanExporter();
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 100, scheduleDelayMs: 0, maxQueueSize: 2, dropPolicy: 'drop-newest' },
      new ManualClock(0),
      [],
      (spans) => dropped.push(...spans.map((s) => s.spanId))
    );
    proc.onEnd(snap('a'));
    proc.onEnd(snap('b'));
    proc.onEnd(snap('c'));
    expect(dropped).toEqual(['c']);
  });

  it('retries failed exports with backoff then succeeds', async () => {
    const exporter = new InMemorySpanExporter();
    exporter.failNextCount = 2;
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 10, scheduleDelayMs: 0, maxQueueSize: 10, maxRetries: 3 },
      new ManualClock(0)
    );
    proc.onEnd(snap('x'));
    await proc.flush();
    expect(exporter.allSpans().length).toBe(1);
    const stats = proc.getStats();
    expect(stats.exportRetries).toBe(2);
    expect(stats.exportErrors).toBe(2);
    expect(stats.exported).toBe(1);
  });

  it('drops a batch after exhausting retries', async () => {
    const droppedBatches: number[] = [];
    const exporter = new InMemorySpanExporter();
    exporter.failNextCount = 100;
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 10, scheduleDelayMs: 0, maxQueueSize: 10, maxRetries: 2 },
      new ManualClock(0),
      [],
      (spans, reason) => {
        expect(reason).toContain('export-failed');
        droppedBatches.push(spans.length);
      }
    );
    proc.onEnd(snap('x'));
    await proc.flush();
    expect(droppedBatches).toEqual([1]);
    expect(proc.getStats().exported).toBe(0);
  });

  it('filters can veto or rewrite spans', async () => {
    const exporter = new InMemorySpanExporter();
    const proc = new BatchSpanProcessor(
      exporter,
      { maxBatchSize: 10, scheduleDelayMs: 0, maxQueueSize: 10 },
      new ManualClock(0),
      [
        (s) => (s.name === 'health' ? undefined : s),
        (s) => ({ ...s, attributes: { ...s.attributes, env: 'test' } }),
      ]
    );
    proc.onEnd({ ...snap('ok'), name: 'real' });
    proc.onEnd({ ...snap('hc'), name: 'health' });
    await proc.flush();
    const exported = exporter.allSpans();
    expect(exported.length).toBe(1);
    expect(exported[0].attributes['env']).toBe('test');
  });
});
