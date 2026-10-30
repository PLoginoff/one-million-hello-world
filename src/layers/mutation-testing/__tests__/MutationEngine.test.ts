/**
 * MutationEngine tests — kill evaluation, scoring, diffs, incremental runs.
 */

import { describe, it, expect } from 'bun:test';
import {
  MutationEngine,
  IncrementalMutationRunner,
  FunctionTestRunner,
  generateMutants,
  parse,
} from '../engine/index';
import type { TestRunResult, TestRunner } from '../engine/index';

/**
 * Simulation runner: evaluates mutated source behavior by applying a
 * predicate supplied by the test — stands in for a real suite.
 */
function runnerThat(fn: (files: ReadonlyMap<string, string>) => TestRunResult): TestRunner {
  return new FunctionTestRunner(fn);
}

const SOURCE = `export function add(a: number, b: number): number {
  return a + b;
}
export function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}`;

describe('MutationEngine.applyMutant / mutantDiff', () => {
  it('splices replacement text at exact offsets', () => {
    const src = 'const r = a + b;';
    const spec = generateMutants(parse(src)).find((m) => m.mutatedText === '-')!;
    expect(MutationEngine.applyMutant(src, spec)).toBe('const r = a - b;');
  });

  it('renders a unified-ish diff', () => {
    const src = 'function f() {\n  return a > 0;\n}';
    const spec = generateMutants(parse(src)).find((m) => m.operator === 'ConditionalBoundary')!;
    const diff = MutationEngine.mutantDiff(src, spec);
    expect(diff).toContain('- return a > 0;');
    expect(diff).toContain('+ return a >= 0;');
    expect(diff).toContain('ConditionalBoundary');
  });
});

describe('kill evaluation', () => {
  it('kills mutants when the simulated suite fails, survives otherwise', async () => {
    // Suite that checks `add` semantics: any mutant changing `a + b`
    // fails; unrelated mutants (e.g. in clamp) survive that check.
    const runner = runnerThat((files) => {
      const src = files.get('src/math.ts')!;
      const tests = [
        {
          name: 'add works',
          status: (src.includes('return a + b') ? 'pass' : 'fail') as 'pass' | 'fail',
        },
      ];
      return { tests, durationMs: 1 };
    });
    const engine = new MutationEngine(runner);
    const report = await engine.run(new Map([['src/math.ts', SOURCE]]));
    expect(report.totalMutants).toBeGreaterThan(10);
    expect(report.killed).toBeGreaterThan(0);
    // mutants affecting `return a + b` are killed
    const addMutants = report.results.filter((r) => r.spec.originalText.trim() === 'a + b');
    expect(addMutants.every((r) => r.status === 'killed')).toBe(true);
  });

  it('counts timeout as killed-equivalent in score numerator', async () => {
    const runner: TestRunner = {
      async run(files) {
        const src = files.get('f.ts')!;
        if (src.includes('i <= n')) return { tests: [], error: 'timeout', durationMs: 0 };
        return { tests: [{ name: 't', status: 'fail' }], durationMs: 1 };
      },
    };
    const engine = new MutationEngine(runner);
    const report = await engine.run(
      new Map([['f.ts', 'for (let i = 0; i < n; i++) tick();']])
    );
    expect(report.timeouts).toBeGreaterThan(0);
    expect(report.mutationScore).toBe(1);
  });

  it('treats runner errors as runtimeError, excluded from score', async () => {
    let calls = 0;
    const runner: TestRunner = {
      async run() {
        calls++;
        if (calls === 1) throw new Error('boom');
        return { tests: [{ name: 't', status: 'fail' }], durationMs: 0 };
      },
    };
    const engine = new MutationEngine(runner);
    const report = await engine.run(new Map([['f.ts', 'const x = 1 + 2;']]));
    expect(report.runtimeErrors).toBe(1);
    expect(report.mutationScore).toBe(1); // all valid mutants killed
  });

  it('marks uncovered-line mutants as noCoverage', async () => {
    const runner = runnerThat(() => ({ tests: [{ name: 't', status: 'pass' }], durationMs: 0 }));
    const src = 'function f() {\n  return a + b;\n  return a * b;\n}';
    const engine = new MutationEngine(runner, {
      coverageLines: new Map([['f.ts', new Set([1, 2])]]),
    });
    const report = await engine.run(new Map([['f.ts', src]]));
    expect(report.noCoverage).toBeGreaterThan(0);
    const line3 = report.results.filter((r) => r.spec.line === 3);
    expect(line3.every((r) => r.status === 'noCoverage')).toBe(true);
  });
});

describe('scoring', () => {
  it('computes killed/(killed+survived) and per-file summaries', async () => {
    const runner: TestRunner = {
      async run(files) {
        // kill exactly the mutants touching 'a + b' text region
        const src = files.get('f.ts')!;
        return {
          tests: [
            {
              name: 'sum',
              status: src.includes('a + b') ? 'pass' : 'fail',
            },
          ],
          durationMs: 0,
        };
      },
    };
    const engine = new MutationEngine(runner);
    const report = await engine.run(new Map([['f.ts', 'const s = a + b; const t = flag ? 1 : 2;']]));
    const valid = report.killed + report.survived;
    expect(report.mutationScore).toBeCloseTo(report.killed / valid, 5);
    expect(report.files).toHaveLength(1);
    expect(report.files[0]?.mutants).toBe(report.totalMutants);
  });

  it('survivorsReport lists only survivors with diffs', async () => {
    const runner = runnerThat(() => ({ tests: [{ name: 't', status: 'pass' }], durationMs: 0 }));
    const engine = new MutationEngine(runner);
    const report = await engine.run(new Map([['f.ts', 'const x = a < b;']]));
    const text = MutationEngine.survivorsReport(report);
    expect(text).toContain('SURVIVED');
    expect(text).toContain('Mutation score: 0.0%');
  });
});

describe('incremental mutation runner', () => {
  it('reuses results for unchanged files', async () => {
    let runs = 0;
    const runner = runnerThat(() => {
      runs++;
      return { tests: [{ name: 't', status: 'fail' }], durationMs: 0 };
    });
    const engine = new MutationEngine(runner);
    const inc = new IncrementalMutationRunner(engine);
    const files = new Map([
      ['a.ts', 'const x = 1 + 2;'],
      ['b.ts', 'const y = 3 * 4;'],
    ]);
    const r1 = await inc.run(files);
    const runsAfterFirst = runs;
    const r2 = await inc.run(files);
    expect(runs).toBe(runsAfterFirst); // no re-runs
    expect(r2.totalMutants).toBe(r1.totalMutants);
  });

  it('re-mutates only changed files', async () => {
    const runner = runnerThat(() => ({ tests: [{ name: 't', status: 'fail' }], durationMs: 0 }));
    const engine = new MutationEngine(runner);
    const inc = new IncrementalMutationRunner(engine);
    const files = new Map([
      ['a.ts', 'const x = 1 + 2;'],
      ['b.ts', 'const y = 3 * 4;'],
    ]);
    await inc.run(files);
    const changed = new Map([
      ['a.ts', 'const x = 1 + 2;'], // same
      ['b.ts', 'const y = 3 - 4;'], // changed
      ['c.ts', 'const z = !flag;'], // new
    ]);
    const r = await inc.run(changed);
    expect(inc.trackedFiles.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(r.totalMutants).toBeGreaterThan(0);
  });

  it('evicts deleted files from the cache', async () => {
    const runner = runnerThat(() => ({ tests: [], durationMs: 0 }));
    const inc = new IncrementalMutationRunner(new MutationEngine(runner));
    await inc.run(new Map([['a.ts', 'x = 1;'], ['b.ts', 'y = 2;']]));
    await inc.run(new Map([['a.ts', 'x = 1;']]));
    expect(inc.trackedFiles).toEqual(['a.ts']);
  });
});
