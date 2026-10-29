/**
 * Sampler tests — head-based determinism, rate limiting, tail policies.
 */

import { describe, it, expect } from 'bun:test';
import {
  AttributeTailPolicy,
  ErrorTailPolicy,
  HeadBasedSampler,
  LatencyTailPolicy,
  ManualClock,
  RateLimitingSampler,
  SpanSignal,
  TailBasedSampler,
  fnv1a32,
  traceIdToFraction,
} from '../../engine';

describe('fnv1a32 / traceIdToFraction', () => {
  it('is deterministic', () => {
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
    expect(traceIdToFraction('trace-xyz')).toBe(traceIdToFraction('trace-xyz'));
  });

  it('maps into [0,1)', () => {
    for (const id of ['a', 'b', 'c', 'trace-1', 'trace-2', 'ff'.repeat(16)]) {
      const f = traceIdToFraction(id);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('HeadBasedSampler', () => {
  it('ratio 1 samples everything', () => {
    const s = new HeadBasedSampler(1);
    for (const id of ['a', 'b', 'c']) expect(s.shouldSample(id)).toBe(true);
  });

  it('ratio 0 samples nothing', () => {
    const s = new HeadBasedSampler(0);
    for (const id of ['a', 'b', 'c']) expect(s.shouldSample(id)).toBe(false);
  });

  it('is consistent for the same trace id', () => {
    const s = new HeadBasedSampler(0.5);
    const first = s.shouldSample('trace-42');
    expect(s.shouldSample('trace-42')).toBe(first);
  });

  it('roughly matches the configured ratio over many ids', () => {
    const s = new HeadBasedSampler(0.3);
    let kept = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if (s.shouldSample(`trace-${i}`)) kept++;
    }
    // Loose bound: within ±5% of expected.
    expect(kept / N).toBeGreaterThan(0.24);
    expect(kept / N).toBeLessThan(0.36);
  });

  it('rejects out-of-range ratios', () => {
    expect(() => new HeadBasedSampler(-0.1)).toThrow();
    expect(() => new HeadBasedSampler(1.1)).toThrow();
  });
});

describe('RateLimitingSampler', () => {
  it('allows up to N traces per second then falls back', () => {
    const clock = new ManualClock(0);
    const s = new RateLimitingSampler(2, 0, clock);
    expect(s.shouldSample('t1')).toBe(true);
    expect(s.shouldSample('t2')).toBe(true);
    expect(s.shouldSample('t3')).toBe(false);
  });

  it('resets after the window rolls over', () => {
    const clock = new ManualClock(0);
    const s = new RateLimitingSampler(1, 0, clock);
    expect(s.shouldSample('t1')).toBe(true);
    expect(s.shouldSample('t2')).toBe(false);
    clock.advance(1001);
    expect(s.shouldSample('t3')).toBe(true);
  });
});

function span(partial: Partial<SpanSignal>): SpanSignal {
  return {
    traceId: 't',
    spanId: 's',
    name: 'op',
    startTimeMs: 0,
    endTimeMs: 10,
    statusCode: 'OK',
    ...partial,
  };
}

describe('TailBasedSampler', () => {
  it('keeps traces with an ERROR span once the root arrives', () => {
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 100,
        policies: [new ErrorTailPolicy()],
        baselineRatio: 0,
      },
      new ManualClock(0)
    );
    sampler.addSpan(span({ traceId: 't1', spanId: 'child', parentSpanId: 'root', statusCode: 'ERROR' }));
    sampler.addSpan(span({ traceId: 't1', spanId: 'root' }));
    const decisions = sampler.flushReady();
    expect(decisions.length).toBe(1);
    expect(decisions[0].keep).toBe(true);
    expect(decisions[0].reason).toContain('error');
  });

  it('keeps slow traces via latency policy', () => {
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 100,
        policies: [new LatencyTailPolicy(500)],
        baselineRatio: 0,
      },
      new ManualClock(0)
    );
    sampler.addSpan(span({ traceId: 't-slow', spanId: 'r', startTimeMs: 0, endTimeMs: 900 }));
    const decisions = sampler.flushReady();
    expect(decisions[0].keep).toBe(true);
    expect(decisions[0].reason).toContain('latency');
  });

  it('drops traces under baseline when no policy fires', () => {
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 100,
        policies: [new ErrorTailPolicy()],
        baselineRatio: 0,
      },
      new ManualClock(0)
    );
    sampler.addSpan(span({ traceId: 't-ok', spanId: 'r' }));
    const decisions = sampler.flushReady();
    expect(decisions[0].keep).toBe(false);
    expect(decisions[0].reason).toContain('baseline');
  });

  it('decides partial traces after the decision window', () => {
    const clock = new ManualClock(0);
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 5000,
        maxPendingTraces: 100,
        policies: [new ErrorTailPolicy()],
        baselineRatio: 1,
      },
      clock
    );
    // Child without a root — stays pending until the window expires.
    sampler.addSpan(span({ traceId: 't-partial', spanId: 'c', parentSpanId: 'root' }));
    expect(sampler.pendingCount()).toBe(1);
    expect(sampler.flushReady().length).toBe(0); // not yet decided
    clock.advance(5001);
    const decisions = sampler.flushReady();
    expect(decisions.length).toBe(1);
    expect(decisions[0].reason).toContain('window-expired');
  });

  it('evicts oldest trace under capacity pressure', () => {
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 2,
        policies: [],
        baselineRatio: 1,
      },
      new ManualClock(0)
    );
    sampler.addSpan(span({ traceId: 't1', spanId: 'c1', parentSpanId: 'r' }));
    sampler.addSpan(span({ traceId: 't2', spanId: 'c2', parentSpanId: 'r' }));
    sampler.addSpan(span({ traceId: 't3', spanId: 'c3', parentSpanId: 'r' }));
    expect(sampler.pendingCount()).toBe(2);
    const decisions = sampler.flushReady();
    expect(decisions.some((d) => d.reason.includes('evicted-capacity'))).toBe(true);
  });

  it('attribute policy keeps matching traces', () => {
    const sampler = new TailBasedSampler(
      {
        decisionWindowMs: 60_000,
        maxPendingTraces: 100,
        policies: [new AttributeTailPolicy('vip', 'true')],
        baselineRatio: 0,
      },
      new ManualClock(0)
    );
    sampler.addSpan(
      span({ traceId: 'tv', spanId: 'r', attributes: { vip: 'true' } })
    );
    const decisions = sampler.flushReady();
    expect(decisions[0].keep).toBe(true);
  });
});
