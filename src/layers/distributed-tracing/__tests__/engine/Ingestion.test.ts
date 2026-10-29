/**
 * TraceIngestion integration tests — assembly + skew + export.
 */

import { describe, it, expect } from 'bun:test';
import {
  ErrorTailPolicy,
  ManualClock,
  TailBasedSampler,
} from '../../../observability/engine';
import {
  InMemorySpanExporter,
  SpanSnapshot,
  TraceIngestion,
} from '../../engine';

function snap(p: Partial<SpanSnapshot> & { spanId: string }): SpanSnapshot {
  return {
    traceId: 't1',
    name: 'op',
    kind: 'internal',
    startTimeMs: 0,
    endTimeMs: 10,
    status: { code: 'OK' },
    attributes: {},
    events: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    ...p,
  };
}

describe('TraceIngestion', () => {
  it('assembles kept traces and exports their spans', async () => {
    const clock = new ManualClock(0);
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 10,
        policies: [new ErrorTailPolicy()],
        baselineRatio: 1,
      },
      clock
    );
    const exporter = new InMemorySpanExporter();
    const ingest = new TraceIngestion({ tailSampler: sampler }, exporter, clock);

    ingest.ingestSpan(snap({ spanId: 'child', parentSpanId: 'root', startTimeMs: 0, endTimeMs: 50 }));
    ingest.ingestSpan(snap({ spanId: 'root', startTimeMs: 0, endTimeMs: 100 }));
    const traces = ingest.flushDecisions();
    expect(traces.length).toBe(1);
    expect(traces[0].keep).toBe(true);
    await ingest.flushExport();
    expect(exporter.allSpans().length).toBe(2);
  });

  it('corrects clock skew during assembly', () => {
    const clock = new ManualClock(0);
    const sampler = new TailBasedSampler(
      { decisionWindowMs: 60_000, maxPendingTraces: 10, policies: [], baselineRatio: 1 },
      clock
    );
    const exporter = new InMemorySpanExporter();
    const ingest = new TraceIngestion({ tailSampler: sampler, correctClockSkew: true }, exporter, clock);

    // Child claims to start before its parent — must be clamped.
    ingest.ingestSpan(snap({ spanId: 'child', parentSpanId: 'root', startTimeMs: -500, endTimeMs: 300 }));
    ingest.ingestSpan(snap({ spanId: 'root', startTimeMs: 0, endTimeMs: 200 }));
    const traces = ingest.flushDecisions();
    const child = traces[0].spans.find((s) => s.spanId === 'child')!;
    expect(child.startTimeMs).toBe(0);
    expect(traces[0].correctionsApplied).toBeGreaterThanOrEqual(1);
  });

  it('counts dropped traces separately', () => {
    const clock = new ManualClock(0);
    const sampler = new TailBasedSampler(
      { decisionWindowMs: 60_000, maxPendingTraces: 10, policies: [], baselineRatio: 0 },
      clock
    );
    const exporter = new InMemorySpanExporter();
    const ingest = new TraceIngestion({ tailSampler: sampler }, exporter, clock);
    ingest.ingestSpan(snap({ spanId: 'root' }));
    const traces = ingest.flushDecisions();
    expect(traces[0].keep).toBe(false);
    expect(ingest.getStats().tracesDropped).toBe(1);
  });
});
