/**
 * Chaos Engineering extras — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { ConsistentHashRing } from '../engine/ConsistentHashRing';
import { MetricStore, P2Quantile } from '../engine/MetricStore';
import { ResilienceScorer } from '../engine/ResilienceScorer';
import { ExperimentState, FaultSeverity, ExperimentReport } from '../engine/ChaosEngineTypes';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function report(finalState: ExperimentState, held = true): ExperimentReport {
  return {
    experimentId: 'e',
    finalState,
    transitions: [],
    decisions: [],
    verdicts: [],
    hypothesisHeld: held,
    startedAt: 0,
    finishedAt: 0,
    durationMs: 0,
  };
}

// ------------------------------------------------------------ ConsistentHashRing

describe('ConsistentHashRing', () => {
  it('same key always maps to same target (determinism)', () => {
    const r = new ConsistentHashRing();
    ['a', 'b', 'c'].forEach((t) => r.add(t));
    const first = r.pick('user-42');
    for (let i = 0; i < 10; i++) {
      expect(r.pick('user-42')).toBe(first);
    }
  });

  it('removing a target remaps only its share of keys', () => {
    const r = new ConsistentHashRing();
    ['a', 'b', 'c'].forEach((t) => r.add(t));
    const before = new Map<string, string | undefined>();
    for (let i = 0; i < 500; i++) before.set(`k${i}`, r.pick(`k${i}`));
    r.remove('b');
    let remapped = 0;
    let stillSame = 0;
    for (const [k, v] of before) {
      const now = r.pick(k);
      if (v === 'b') {
        if (now !== 'b') remapped++;
      } else {
        if (now === v) stillSame++;
      }
    }
    // All former 'b' keys remapped; most non-'b' keys untouched.
    expect(remapped).toBeGreaterThan(0);
    const nonB = [...before.values()].filter((v) => v !== 'b').length;
    expect(stillSame / nonB).toBeGreaterThan(0.9);
  });

  it('measuredShare roughly matches 1/N for balanced rings', () => {
    const r = new ConsistentHashRing(400);
    ['a', 'b', 'c'].forEach((t) => r.add(t));
    for (const t of ['a', 'b', 'c']) {
      const share = r.measuredShare(t, 2000);
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.5);
    }
  });

  it('pickN returns n distinct targets', () => {
    const r = new ConsistentHashRing();
    ['a', 'b', 'c', 'd'].forEach((t) => r.add(t));
    const picks = r.pickN('shard-1', 3);
    expect(picks.length).toBe(3);
    expect(new Set(picks).size).toBe(3);
  });

  it('inScope + selectFraction give deterministic blast-radius membership', () => {
    const r = new ConsistentHashRing();
    for (let i = 0; i < 20; i++) r.add(`t${i}`);
    const sel = r.selectFraction(0.25);
    expect(sel.size).toBe(5);
    // Same key → same in/out decision every time.
    const key = 'req-7';
    const d1 = r.inScope(key, sel);
    expect(r.inScope(key, sel)).toBe(d1);
  });

  it('weighted targets capture proportionally more keys', () => {
    const r = new ConsistentHashRing();
    r.add('light', 1);
    r.add('heavy', 3);
    const lightShare = r.measuredShare('light', 3000);
    const heavyShare = r.measuredShare('heavy', 3000);
    expect(heavyShare).toBeGreaterThan(lightShare);
  });
});

// ------------------------------------------------------------------ MetricStore

describe('MetricStore', () => {
  it('P2Quantile converges near the true quantile', () => {
    const q = new P2Quantile(0.5);
    // Sorted stream 0..999 — median should be ≈500.
    for (let i = 0; i < 1000; i++) q.add(i);
    expect(q.value()).toBeGreaterThan(400);
    expect(q.value()).toBeLessThan(600);
  });

  it('p99 tracks the tail on a skewed stream', () => {
    const q = new P2Quantile(0.99);
    // 990 low values + 10 extreme outliers (1000+) — true p99 sits at the
    // base of the outlier tail; P² lands in its neighborhood.
    for (let i = 0; i < 1000; i++) q.add(i < 990 ? i % 10 : 1000 + i);
    expect(q.value()).toBeGreaterThan(500); // far above the 0..9 body
  });

  it('summarize produces count/mean/quantiles/min/max', () => {
    const clk = fakeClock();
    const m = new MetricStore(clk.now);
    for (let i = 1; i <= 100; i++) m.record('lat', i);
    const s = m.summarize('lat')!;
    expect(s.count).toBe(100);
    expect(s.mean).toBeCloseTo(50.5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p50).toBeGreaterThan(30);
    expect(s.p50).toBeLessThan(70);
    expect(s.p99).toBeGreaterThan(90);
  });

  it('ratePerSec derives slope over the retained window', () => {
    const clk = fakeClock();
    const m = new MetricStore(clk.now);
    m.record('x', 0);
    clk.advance(2000);
    m.record('x', 10); // +10 in 2s = 5/s
    const s = m.summarize('x')!;
    expect(s.ratePerSec).toBeCloseTo(5, 0);
  });
});

// ------------------------------------------------------------- ResilienceScorer

describe('ResilienceScorer', () => {
  it('held hypotheses score full credit weighted by severity', () => {
    const s = new ResilienceScorer();
    s.record({ faultSeverity: FaultSeverity.CRITICAL, targetId: 't', report: report(ExperimentState.COMPLETED, true) });
    expect(s.score('t').score).toBe(1);
  });

  it('aborted experiments earn zero credit', () => {
    const s = new ResilienceScorer();
    s.record({ faultSeverity: FaultSeverity.LOW, targetId: 't', report: report(ExperimentState.COMPLETED, true) });
    s.record({ faultSeverity: FaultSeverity.CRITICAL, targetId: 't', report: report(ExperimentState.ABORTED) });
    // (0.5×1 + 2×0) / (0.5+2) = 0.2
    expect(s.score('t').score).toBeCloseTo(0.2);
  });

  it('violated hypotheses earn partial credit', () => {
    const s = new ResilienceScorer();
    s.record({ faultSeverity: FaultSeverity.MEDIUM, targetId: 't', report: report(ExperimentState.COMPLETED, false) });
    expect(s.score('t').score).toBeCloseTo(0.4);
  });

  it('weakest() surfaces low scorers; scoreAll sorts ascending', () => {
    const s = new ResilienceScorer();
    s.record({ faultSeverity: FaultSeverity.MEDIUM, targetId: 'good', report: report(ExperimentState.COMPLETED, true) });
    s.record({ faultSeverity: FaultSeverity.MEDIUM, targetId: 'bad', report: report(ExperimentState.ABORTED) });
    const all = s.scoreAll();
    expect(all[0].targetId).toBe('bad');
    expect(s.weakest(0.7).map((x) => x.targetId)).toEqual(['bad']);
  });
});
