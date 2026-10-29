/**
 * Canary Deploy extras — unit tests (bun:test)
 */

import { describe, it, expect } from 'bun:test';
import { CanaryJudge } from '../canary/CanaryJudge';
import { AnalysisHistory, leastSquaresSlope } from '../canary/AnalysisHistory';
import { AnalysisResult, GateVerdict } from '../canary/CanaryTypes';

function verdict(gate: string, passed: boolean, canaryValue = 0, baselineValue = 0): GateVerdict {
  return { gate, passed, score: 0, canaryValue, baselineValue, reason: '' };
}

function result(stepIndex: number, verdicts: GateVerdict[], passed: boolean): AnalysisResult {
  return { stepIndex, windowStart: 0, windowEnd: 0, verdicts, passed };
}

// ------------------------------------------------------------------ CanaryJudge

describe('CanaryJudge', () => {
  const groups = [
    { name: 'errors', weight: 3, gates: ['error-rate'] },
    { name: 'perf', weight: 1, gates: ['p99'] },
  ];
  const judge = new CanaryJudge(groups, { pass: 0.9, marginal: 0.5 });

  it('PASS when all gates pass', () => {
    const r = judge.judge([verdict('error-rate', true), verdict('p99', true)]);
    expect(r.classification).toBe('PASS');
    expect(r.score).toBe(1);
  });

  it('FAIL when the heavyweight group fails despite light group passing', () => {
    const r = judge.judge([verdict('error-rate', false), verdict('p99', true)]);
    // errors group scored 0 → fatal failure regardless of aggregate.
    expect(r.classification).toBe('FAIL');
    expect(r.fatalGroupFailure).toBe(true);
  });

  it('weighted aggregate drives MARGINAL between thresholds', () => {
    // perf group partially fails (1 of 2 gates) → group score 0.5, not fatal.
    const j = new CanaryJudge(
      [
        { name: 'errors', weight: 3, gates: ['error-rate'] },
        { name: 'perf', weight: 1, gates: ['p99', 'p50'] },
      ],
      { pass: 0.9, marginal: 0.5 }
    );
    const r = j.judge([
      verdict('error-rate', true),
      verdict('p99', false),
      verdict('p50', true),
    ]);
    // score = (3×1 + 1×0.5)/4 = 0.875 → ≥ marginal 0.5, < pass 0.9
    expect(r.score).toBeCloseTo(0.875);
    expect(r.classification).toBe('MARGINAL');
  });

  it('ungrouped gates join a synthetic group rather than being dropped', () => {
    const r = judge.judge([verdict('mystery', false)]);
    expect(r.groups.some((g) => g.group === 'ungrouped')).toBe(true);
    expect(r.classification).toBe('FAIL');
  });
});

// -------------------------------------------------------------- AnalysisHistory

describe('AnalysisHistory', () => {
  it('leastSquaresSlope computes exact slope on linear data', () => {
    expect(leastSquaresSlope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2);
    expect(leastSquaresSlope([0, 1, 2], [5, 5, 5])).toBe(0);
  });

  it('detects monotonic degradation invisible to per-window gates', () => {
    const h = new AnalysisHistory();
    // Canary error rate creeps up each window but stays under threshold —
    // every window passes yet the trend is adverse.
    for (let i = 0; i < 6; i++) {
      h.record(
        result(0, [verdict('err', true, 0.01 + i * 0.02, 0.01)], true)
      );
    }
    const t = h.trend('err', 6, { slopeThreshold: 0.005, runLimit: 3 });
    expect(t).not.toBeNull();
    expect(t!.degrading).toBe(true);
    expect(t!.slope).toBeCloseTo(0.02);
    expect(t!.adverseRunLength).toBeGreaterThanOrEqual(3);
  });

  it('stable metrics produce no trend', () => {
    const h = new AnalysisHistory();
    for (let i = 0; i < 5; i++) {
      h.record(result(0, [verdict('err', true, 0.01, 0.01)], true));
    }
    const t = h.trend('err', 5);
    expect(t?.degrading).toBeFalsy();
  });

  it('degrading() aggregates across gates', () => {
    const h = new AnalysisHistory();
    for (let i = 0; i < 4; i++) {
      h.record(
        result(0, [
          verdict('err', true, 0.01 + i * 0.02, 0.01),
          verdict('lat', true, 100, 100),
        ], true)
      );
    }
    const d = h.degrading(4);
    expect(d.map((x) => x.gate)).toContain('err');
    expect(d.map((x) => x.gate)).not.toContain('lat');
  });
});
