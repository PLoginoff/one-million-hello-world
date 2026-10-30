/**
 * MutationEngine
 *
 * Applies mutant specs to source, orchestrates kill-evaluation through a
 * pluggable {@link TestRunner}, and computes mutation scores with
 * surviving-mutant diffs. Also provides incremental runs: mutants are
 * only regenerated for files whose content hash changed.
 *
 * Kill semantics (Stryker-style):
 *   - the mutant source replaces the original for the target file;
 *   - the suite is invoked via the runner abstraction;
 *   - any failing test ⇒ KILLED; suite passes ⇒ SURVIVED;
 *   - runner error (compile error, timeout) ⇒ RUNTIME_ERROR / TIMEOUT
 *     and does not count against the score denominator (Stryker counts
 *     compile-error mutants separately — they pollute scores otherwise).
 *
 * Score = (killed + timeout) / (total - errors - noCoverage) — timeout is
 * conventionally counted as killed because it indicates an infinite loop
 * introduced by the mutation, which a real suite would flag.
 *
 * @module MutationTesting/Engine
 */

import { parse } from './CodeModel';
import {
  MutantSpec,
  MutationOperator,
  defaultOperators,
  generateMutants,
} from './MutationOperators';

/* ------------------------------------------------------------------------ */
/* Test runner abstraction                                                  */
/* ------------------------------------------------------------------------ */

/** Outcome of running the suite once. */
export interface TestRunResult {
  /** Individual test outcomes. */
  readonly tests: readonly TestOutcome[];
  /** Suite-level error (compile failure, infra error). */
  readonly error?: string;
  /** Wall-clock duration as reported by the runner. */
  readonly durationMs: number;
}

export interface TestOutcome {
  readonly name: string;
  readonly status: 'pass' | 'fail';
  readonly message?: string;
}

/**
 * Pluggable test runner. In real use this shells out to `bun test` on a
 * patched workspace; the simulation contract is intentionally narrow so
 * deterministic in-process runners (which interpret the mutated source)
 * can stand in during testing.
 */
export interface TestRunner {
  /**
   * Run the test suite against a workspace where `files` maps path →
   * current source (mutants applied). Must not mutate `files`.
   */
  run(files: ReadonlyMap<string, string>, timeoutMs?: number): Promise<TestRunResult>;
}

/** Simple function-backed runner for simulations and tests. */
export class FunctionTestRunner implements TestRunner {
  constructor(
    private readonly _fn: (
      files: ReadonlyMap<string, string>
    ) => TestRunResult | Promise<TestRunResult>
  ) {}

  run(files: ReadonlyMap<string, string>): Promise<TestRunResult> {
    return Promise.resolve(this._fn(files));
  }
}

/* ------------------------------------------------------------------------ */
/* Results                                                                  */
/* ------------------------------------------------------------------------ */

export type MutantStatus =
  | 'killed'
  | 'survived'
  | 'timeout'
  | 'runtimeError'
  | 'noCoverage'
  | 'pending';

/** Evaluation result for one mutant. */
export interface MutantResult {
  readonly spec: MutantSpec;
  readonly file: string;
  readonly status: MutantStatus;
  /** Names of tests that killed the mutant (first few). */
  readonly killedBy: readonly string[];
  /** Mutated source around the site for reporting. */
  readonly diff: string;
  readonly durationMs: number;
}

/** Aggregate score and breakdown. */
export interface MutationReport {
  readonly totalMutants: number;
  readonly killed: number;
  readonly survived: number;
  readonly timeouts: number;
  readonly runtimeErrors: number;
  readonly noCoverage: number;
  /** killed / (killed + survived) — the headline number. */
  readonly mutationScore: number;
  readonly results: readonly MutantResult[];
  readonly durationMs: number;
  readonly files: readonly FileMutationSummary[];
}

export interface FileMutationSummary {
  readonly file: string;
  readonly mutants: number;
  readonly killed: number;
  readonly survived: number;
  readonly score: number;
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                   */
/* ------------------------------------------------------------------------ */

export interface MutationEngineOptions {
  readonly operators?: readonly MutationOperator[];
  /** max mutants per file (0 = unlimited) */
  readonly maxMutantsPerFile?: number;
  /** per-run timeout passed to runner */
  readonly runTimeoutMs?: number;
  /** enable mutant coverage pruning: mutants on lines the runner
      reports as uncovered are skipped as `noCoverage` */
  readonly coverageLines?: ReadonlyMap<string, ReadonlySet<number>>;
}

/**
 * Mutation testing engine. Typical usage:
 *
 * ```ts
 * const engine = new MutationEngine(runner);
 * const report = await engine.run(new Map([['src/math.ts', source]]));
 * ```
 */
export class MutationEngine {
  private readonly _operators: readonly MutationOperator[];
  private readonly _maxMutants: number;
  private readonly _runTimeout: number | undefined;
  private readonly _coverage: ReadonlyMap<string, ReadonlySet<number>> | undefined;

  constructor(
    private readonly _runner: TestRunner,
    options: MutationEngineOptions = {}
  ) {
    this._operators = options.operators ?? defaultOperators();
    this._maxMutants = options.maxMutantsPerFile ?? 0;
    this._runTimeout = options.runTimeoutMs;
    this._coverage = options.coverageLines;
  }

  /**
   * Apply a mutant to source text. The spec's `[start,end)` range is
   * replaced by `mutatedText`.
   */
  static applyMutant(source: string, spec: MutantSpec): string {
    return source.slice(0, spec.start) + spec.mutatedText + source.slice(spec.end);
  }

  /**
   * Render a unified-ish diff of the mutation site (context: the full
   * mutated line).
   */
  static mutantDiff(source: string, spec: MutantSpec): string {
    const mutated = MutationEngine.applyMutant(source, spec);
    const lineStart = source.lastIndexOf('\n', spec.start - 1) + 1;
    const origLineEnd = source.indexOf('\n', spec.end);
    const mutLineEnd = mutated.indexOf('\n', spec.start + spec.mutatedText.length);
    const origLine = source.slice(lineStart, origLineEnd === -1 ? source.length : origLineEnd);
    const mutLine = mutated.slice(lineStart, mutLineEnd === -1 ? mutated.length : mutLineEnd);
    return [
      `@@ line ${spec.line}:${spec.column} [${spec.operator}]`,
      `- ${origLine.trim()}`,
      `+ ${mutLine.trim()}`,
    ].join('\n');
  }

  /** Parse + generate mutants for one file. */
  generateFileMutants(file: string, source: string): readonly MutantSpec[] {
    void file;
    const program = parse(source);
    const mutants = generateMutants(program, this._operators);
    if (this._maxMutants > 0 && mutants.length > this._maxMutants) {
      // deterministic uniform subsample keeps the operator mix
      // representative
      const step = mutants.length / this._maxMutants;
      const picked: MutantSpec[] = [];
      for (let i = 0; i < this._maxMutants; i++) {
        picked.push(mutants[Math.floor(i * step)]);
      }
      return picked;
    }
    return mutants;
  }

  /** Evaluate a single mutant against the suite. */
  async evaluateMutant(
    file: string,
    source: string,
    spec: MutantSpec,
    files: ReadonlyMap<string, string>
  ): Promise<MutantResult> {
    const started = Date.now();
    const covered = this._coverage?.get(file);
    if (covered && !covered.has(spec.line)) {
      return {
        spec,
        file,
        status: 'noCoverage',
        killedBy: [],
        diff: MutationEngine.mutantDiff(source, spec),
        durationMs: 0,
      };
    }
    const mutantSource = MutationEngine.applyMutant(source, spec);
    const runFiles = new Map(files);
    runFiles.set(file, mutantSource);

    let result: TestRunResult;
    try {
      result = await this._runner.run(runFiles, this._runTimeout);
    } catch (e) {
      return {
        spec,
        file,
        status: 'runtimeError',
        killedBy: [],
        diff: MutationEngine.mutantDiff(source, spec),
        durationMs: Date.now() - started,
      };
    }

    if (result.error !== undefined) {
      const isTimeout = result.error === 'timeout';
      return {
        spec,
        file,
        status: isTimeout ? 'timeout' : 'runtimeError',
        killedBy: [],
        diff: MutationEngine.mutantDiff(source, spec),
        durationMs: Date.now() - started,
      };
    }

    const failed = result.tests.filter((t) => t.status === 'fail');
    const killed = failed.length > 0;
    return {
      spec,
      file,
      status: killed ? 'killed' : 'survived',
      killedBy: killed ? failed.slice(0, 5).map((t) => t.name) : [],
      diff: MutationEngine.mutantDiff(source, spec),
      durationMs: Date.now() - started,
    };
  }

  /**
   * Full run: generate mutants per file, evaluate each sequentially.
   *
   * Concurrency is deliberately left to runners (the simulation runner
   * is sync-fast; real runners parallelize via worker pools).
   */
  async run(files: ReadonlyMap<string, string>): Promise<MutationReport> {
    const started = Date.now();
    const results: MutantResult[] = [];
    for (const [file, source] of files) {
      const mutants = this.generateFileMutants(file, source);
      for (const spec of mutants) {
        results.push(await this.evaluateMutant(file, source, spec, files));
      }
    }
    return MutationEngine.report(results, Date.now() - started);
  }

  /** Aggregate results into a report. */
  static report(results: readonly MutantResult[], durationMs: number): MutationReport {
    let killed = 0;
    let survived = 0;
    let timeouts = 0;
    let errors = 0;
    let noCov = 0;
    const byFile = new Map<string, MutantResult[]>();
    for (const r of results) {
      switch (r.status) {
        case 'killed': killed++; break;
        case 'survived': survived++; break;
        case 'timeout': timeouts++; break;
        case 'runtimeError': errors++; break;
        case 'noCoverage': noCov++; break;
        case 'pending': break;
      }
      const arr = byFile.get(r.file) ?? [];
      arr.push(r);
      byFile.set(r.file, arr);
    }
    const detected = killed + timeouts;
    const valid = detected + survived;
    const fileSummaries: FileMutationSummary[] = [...byFile.entries()].map(([file, rs]) => {
      const fk = rs.filter((r) => r.status === 'killed' || r.status === 'timeout').length;
      const fs = rs.filter((r) => r.status === 'survived').length;
      return {
        file,
        mutants: rs.length,
        killed: fk,
        survived: fs,
        score: fk + fs === 0 ? 1 : fk / (fk + fs),
      };
    });
    return {
      totalMutants: results.length,
      killed,
      survived,
      timeouts,
      runtimeErrors: errors,
      noCoverage: noCov,
      mutationScore: valid === 0 ? 1 : detected / valid,
      results,
      durationMs,
      files: fileSummaries,
    };
  }

  /** Surviving mutants formatted as a report block. */
  static survivorsReport(report: MutationReport): string {
    const lines: string[] = [
      `Mutation score: ${(report.mutationScore * 100).toFixed(1)}%`,
      `Killed: ${report.killed}  Survived: ${report.survived}  Timeout: ${report.timeouts}  Errors: ${report.runtimeErrors}  NoCoverage: ${report.noCoverage}`,
      '',
    ];
    for (const r of report.results.filter((x) => x.status === 'survived')) {
      lines.push(`SURVIVED ${r.file}:${r.spec.line}:${r.spec.column} [${r.spec.operator}]`);
      lines.push(`  ${r.spec.originalText.trim()}  ->  ${r.spec.mutatedText.trim()}`);
      lines.push(r.diff.split('\n').slice(1).join('\n'));
      lines.push('');
    }
    return lines.join('\n');
  }
}

/* ------------------------------------------------------------------------ */
/* Incremental runner                                                       */
/* ------------------------------------------------------------------------ */

/** Persisted per-file state for incremental runs. */
interface FileState {
  readonly hash: number;
  readonly results: readonly MutantResult[];
}

/**
 * Incremental mutation testing: caches per-file results keyed by a
 * content hash so only changed files are re-mutated and re-evaluated.
 * Hash is FNV-1a 32-bit — O(n), good avalanche for short diffs.
 */
export class IncrementalMutationRunner {
  private readonly _cache = new Map<string, FileState>();

  constructor(private readonly _engine: MutationEngine) {}

  /** FNV-1a hash over UTF-16 code units. */
  static hash(source: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) {
      h ^= source.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Run mutation over `files`, reusing cached results for files whose
   * content hash is unchanged. Deleted files are evicted.
   */
  async run(files: ReadonlyMap<string, string>): Promise<MutationReport> {
    const started = Date.now();
    const allResults: MutantResult[] = [];
    const seen = new Set<string>();

    for (const [file, source] of files) {
      seen.add(file);
      const hash = IncrementalMutationRunner.hash(source);
      const cached = this._cache.get(file);
      if (cached && cached.hash === hash) {
        allResults.push(...cached.results);
        continue;
      }
      const fileResults: MutantResult[] = [];
      const specs = this._engine.generateFileMutants(file, source);
      for (const spec of specs) {
        fileResults.push(await this._engine.evaluateMutant(file, source, spec, files));
      }
      this._cache.set(file, { hash, results: fileResults });
      allResults.push(...fileResults);
    }
    // evict removed files
    for (const key of this._cache.keys()) {
      if (!seen.has(key)) this._cache.delete(key);
    }
    return MutationEngine.report(allResults, Date.now() - started);
  }

  /** Files currently tracked by the incremental cache. */
  get trackedFiles(): readonly string[] {
    return [...this._cache.keys()];
  }
}
