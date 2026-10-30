/**
 * MutationAnalysis tests — coverage matrix, equivalent mutants, gates.
 */

import { describe, it, expect } from 'bun:test';
import {
  CoverageMatrix,
  EquivalentMutantDetector,
  MutationScoreTrend,
  MutationEfficiency,
  MutationEngine,
  InterpretedTestRunner,
  FunctionTestRunner,
} from '../engine/index';
import type { MutantResult, MutationReport } from '../engine/index';

const SRC = `export function add(a: number, b: number): number {
  return a + b;
}
export function risky(v: number): number {
  if (v < 0) return -1;
  return v * 2;
}`;

async function makeReport(): Promise<MutationReport> {
  const runner = new InterpretedTestRunner('f.ts', [
    { name: 'add', fnName: 'add', args: [1, 2], expected: 3 },
    { name: 'risky-neg', fnName: 'risky', args: [-5], expected: -1 },
    { name: 'risky-pos', fnName: 'risky', args: [3], expected: 6 },
  ]);
  const engine = new MutationEngine(runner);
  return engine.run(new Map([['f.ts', SRC]]));
}

describe('CoverageMatrix', () => {
  it('identifies uncovered hotspots and line kill ratios', async () => {
    const report = await makeReport();
    const cov = new CoverageMatrix(
      report.results,
      new Map([['f.ts', new Set([1, 2, 3, 4, 5, 6, 7])]])
    );
    expect(cov.uncoveredHotspots('f.ts')).toHaveLength(0);
    const ratios = cov.lineKillRatios('f.ts');
    expect(ratios.length).toBeGreaterThan(0);
    expect(ratios.every((r) => r.ratio >= 0 && r.ratio <= 1)).toBe(true);
    const weak = cov.weakestFiles();
    expect(weak[0]?.file).toBe('f.ts');
  });

  it('flags lines with mutants but no coverage', async () => {
    const report = await makeReport();
    const cov = new CoverageMatrix(
      report.results,
      new Map([['f.ts', new Set([2])]]) // only line 2 covered
    );
    const hot = cov.uncoveredHotspots('f.ts');
    expect(hot.length).toBeGreaterThan(0);
    expect(hot.every((h) => h.line !== 2)).toBe(true);
  });
});

describe('EquivalentMutantDetector', () => {
  it('detects dead-code mutants as likely equivalent', async () => {
    const src = `export function live() { return 1; }
function dead(x: number) { return x + 1; }`; // dead never called/exported
    const detector = new EquivalentMutantDetector(src);
    const runner = new FunctionTestRunner(() => ({
      tests: [{ name: 't', status: 'pass' }],
      durationMs: 0,
    }));
    const engine = new MutationEngine(runner);
    const report = await engine.run(new Map([['f.ts', src]]));
    const { likelyEquivalent, actionable } = detector.filterActionable(report);
    // `dead` is never called or exported — its mutants should be flagged
    const deadMutants = report.results.filter(
      (r) => r.spec.line >= 2
    );
    expect(likelyEquivalent.length + actionable.length).toBe(report.results.length);
    // at least one dead-code mutant flagged
    expect(likelyEquivalent.length).toBeGreaterThan(0);
  });

  it('detects neutral-identity arithmetic mutants', () => {
    const src = 'export function f(x: number) { return x + 0; }';
    const detector = new EquivalentMutantDetector(src);
    const results: MutantResult[] = [
      {
        spec: {
          operator: 'ArithmeticOperator',
          id: 'a', start: 43, end: 44,
          originalText: '+', mutatedText: '-',
          line: 1, column: 44, description: '+ -> -',
        },
        file: 'f.ts', status: 'survived', killedBy: [], diff: '', durationMs: 0,
      },
    ];
    const { likelyEquivalent } = detector.filterActionable({
      totalMutants: 1, killed: 0, survived: 1, timeouts: 0,
      runtimeErrors: 0, noCoverage: 0, mutationScore: 0,
      results, durationMs: 0, files: [],
    });
    expect(likelyEquivalent).toHaveLength(1);
  });
});

describe('MutationScoreTrend', () => {
  const fakeReport = (score: number): MutationReport => ({
    totalMutants: 100, killed: Math.round(score * 100), survived: Math.round((1 - score) * 100),
    timeouts: 0, runtimeErrors: 0, noCoverage: 0,
    mutationScore: score, results: [], durationMs: 0, files: [],
  });

  it('gates on score floor and regression', () => {
    const t = new MutationScoreTrend();
    t.add(fakeReport(0.8));
    t.add(fakeReport(0.6));
    const gate = t.gate({ minScore: 0.7 });
    expect(gate.pass).toBe(false);
    expect(gate.reasons[0]).toContain('below floor');
    const gate2 = t.gate({ minScore: 0.5 });
    expect(gate2.pass).toBe(true);
    const gate3 = t.gate({ noRegression: true });
    expect(gate3.pass).toBe(false);
  });

  it('computes score slope', () => {
    const t = new MutationScoreTrend();
    [0.5, 0.6, 0.7, 0.8].forEach((s) => t.add(fakeReport(s)));
    expect(t.slope()).toBeCloseTo(0.1, 5);
  });
});

describe('MutationEfficiency', () => {
  it('breaks down kills by operator', async () => {
    const report = await makeReport();
    const stats = MutationEfficiency.byOperator(report);
    expect(stats.length).toBeGreaterThan(0);
    const total = stats.reduce((s, x) => s + x.generated, 0);
    expect(total).toBe(report.totalMutants);
    // every operator has kill ratio in [0,1]
    expect(stats.every((s) => s.killRatio >= 0 && s.killRatio <= 1)).toBe(true);
  });

  it('ranks weak test areas', async () => {
    const report = await makeReport();
    const weak = MutationEfficiency.weakestTestAreas(report);
    expect(weak[0]?.file).toBe('f.ts');
  });
});
