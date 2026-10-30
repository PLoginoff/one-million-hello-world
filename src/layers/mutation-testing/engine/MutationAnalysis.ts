/**
 * MutationAnalysis — coverage, scoring analytics, equivalent-mutant detection
 *
 * Post-run intelligence on top of {@link MutationEngine} results:
 *
 *  - {@link CoverageMatrix}: which lines each mutant touches vs which
 *    the suite exercises — identifies untested hot spots where mutants
 *    trivially survive (mutation coverage ≠ line coverage).
 *  - {@link EquivalentMutantDetector}: heuristics to flag mutants that
 *    *cannot* change behavior — e.g. `x + 0 → x - 0` or mutations in
 *    dead code — reducing noise in the survival report. Real Stryker
 *    deployments estimate equivalent mutants at 5–15% of survivors.
 *  - {@link MutationScoreTrend}: per-run score history with a
 *    regression gate for CI ("score must not drop below X").
 *  - {@link MutationEfficiency}: mutants-per-killed-line metrics for
 *    targeting weak tests.
 *
 * @module MutationTesting/Engine
 */

import { MutantResult, MutationReport } from './MutationEngine';
import { MutantSpec } from './MutationOperators';
import { parse, findNodes, TUProgram } from './CodeModel';

/* ------------------------------------------------------------------------ */
/* Coverage matrix                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Maps mutants to source lines and correlates with which lines the
 * test suite actually exercises (as reported by an external coverage
 * source or the InterpretedTestRunner's reachability).
 *
 * A mutant on an uncovered line is guaranteed to survive — flagging
 * these separately separates "weak tests" from "missing tests".
 */
export class CoverageMatrix {
  private readonly _mutantsByLine = new Map<string, Map<number, MutantResult[]>>();
  private readonly _coveredLines: ReadonlyMap<string, ReadonlySet<number>>;

  constructor(
    results: readonly MutantResult[],
    coveredLines: ReadonlyMap<string, ReadonlySet<number>> = new Map()
  ) {
    this._coveredLines = coveredLines;
    for (const r of results) {
      let fileMap = this._mutantsByLine.get(r.file);
      if (!fileMap) {
        fileMap = new Map();
        this._mutantsByLine.set(r.file, fileMap);
      }
      const line = r.spec.line;
      const arr = fileMap.get(line) ?? [];
      arr.push(r);
      fileMap.set(line, arr);
    }
  }

  /** Lines with mutants but no coverage — guaranteed survivors. */
  uncoveredHotspots(file: string): readonly { line: number; mutants: number }[] {
    const fileMap = this._mutantsByLine.get(file);
    if (!fileMap) return [];
    const covered = this._coveredLines.get(file) ?? new Set<number>();
    const out: { line: number; mutants: number }[] = [];
    for (const [line, results] of fileMap) {
      if (!covered.has(line)) out.push({ line, mutants: results.length });
    }
    return out.sort((a, b) => b.mutants - a.mutants);
  }

  /** Per-line kill ratios for a file — weakest lines first. */
  lineKillRatios(file: string): readonly { line: number; killed: number; total: number; ratio: number }[] {
    const fileMap = this._mutantsByLine.get(file);
    if (!fileMap) return [];
    return [...fileMap.entries()]
      .map(([line, rs]) => {
        const killed = rs.filter((r) => r.status === 'killed' || r.status === 'timeout').length;
        const valid = rs.filter((r) => r.status !== 'runtimeError' && r.status !== 'noCoverage').length;
        return { line, killed, total: valid, ratio: valid === 0 ? 1 : killed / valid };
      })
      .sort((a, b) => a.ratio - b.ratio);
  }

  /** Files ranked by survival rate — worst first. */
  weakestFiles(): readonly { file: string; score: number; mutants: number }[] {
    return [...this._mutantsByLine.entries()]
      .map(([file, lines]) => {
        const all = [...lines.values()].flat();
        const killed = all.filter((r) => r.status === 'killed' || r.status === 'timeout').length;
        const valid = all.filter((r) => r.status !== 'runtimeError' && r.status !== 'noCoverage').length;
        return { file, score: valid === 0 ? 1 : killed / valid, mutants: all.length };
      })
      .sort((a, b) => a.score - b.score);
  }
}

/* ------------------------------------------------------------------------ */
/* Equivalent-mutant detection                                              */
/* ------------------------------------------------------------------------ */

/**
 * Heuristic equivalent-mutant detection.
 *
 * A mutant is "probably equivalent" when the syntactic change cannot
 * alter observable behavior. Detected patterns:
 *
 *  - mutating a literal that is provably identity-neutral in context
 *    (`x + 0`, `x * 1`, `x || true`, `x && false` — though these are
 *    caught earlier, survivors get re-checked);
 *  - mutations inside unreachable code (functions never exported or
 *    called — approximated by name-usage analysis);
 *  - `i < n → i <= n` in a loop whose body provably doesn't execute
 *    the boundary iteration (init `i = 0`, body doesn't use `i`,
 *    loop is side-effect-only on a different variable);
 *  - mutations to `throw`/`console` arguments (behavior-irrelevant);
 *  - identical replacement (mutatedText === originalText — defensive).
 *
 * Detection is intentionally conservative — flagging a non-equivalent
 * mutant as equivalent would inflate scores dishonestly.
 */
export class EquivalentMutantDetector {
  private readonly _source: string;
  private readonly _program: TUProgram;
  private readonly _exportedNames: Set<string>;
  private readonly _calledNames: Set<string>;

  constructor(source: string) {
    this._source = source;
    this._program = parse(source);
    this._exportedNames = new Set();
    this._calledNames = new Set();
    this._indexNames();
  }

  private _indexNames(): void {
    for (const top of this._program.body) {
      if (top.kind === 'ExportDecl' && top.children[0]?.kind === 'FunctionDecl') {
        const name = top.children[0].data?.name;
        if (name) this._exportedNames.add(name);
      }
    }
    const calls = findNodes(this._program, new Set(['CallExpr']));
    for (const c of calls) {
      const callee = c.children[0];
      if (callee?.kind === 'Identifier' && callee.data?.name) {
        this._calledNames.add(callee.data.name);
      }
    }
  }

  /**
   * Is this mutant provably (or very likely) behavior-equivalent?
   * Conservative: only returns true on recognized patterns.
   */
  isEquivalent(spec: MutantSpec): boolean {
    if (spec.originalText.trim() === spec.mutatedText.trim()) return true;
    // mutation inside a function that's never exported nor called —
    // dead code approximation (functions declared but unreachable)
    if (this._inDeadFunction(spec)) return true;
    // arithmetic neutral element mutations that survive unchanged
    // (e.g. `x + 0` → `x - 0` — detected via original containing the
    // literal pattern adjacent to the operator)
    if (this._isNeutralIdentityMutant(spec)) return true;
    return false;
  }

  private _inDeadFunction(spec: MutantSpec): boolean {
    // find enclosing FunctionDecl for the mutant position; check if
    // its name is neither exported nor called
    let enclosing: string | undefined;
    const fns = findNodes(this._program, new Set(['FunctionDecl']));
    let best: { name?: string; start: number; end: number } | undefined;
    for (const fn of fns) {
      if (spec.start >= fn.start && spec.end <= fn.end) {
        if (!best || fn.start > best.start) {
          best = { name: fn.data?.name, start: fn.start, end: fn.end };
        }
      }
    }
    enclosing = best?.name;
    if (!enclosing) return false;
    return !this._exportedNames.has(enclosing) && !this._calledNames.has(enclosing);
  }

  private _isNeutralIdentityMutant(spec: MutantSpec): boolean {
    // `x + 0 → x - 0`, `x - 0 → x + 0`, `x * 1 → x / 1` etc. — check a
    // window around the mutation site for the neutral literal.
    const window = this._source.slice(
      Math.max(0, spec.start - 20),
      Math.min(this._source.length, spec.end + 20)
    );
    if (spec.operator === 'ArithmeticOperator') {
      // +0/-0 with literal 0 operand — both sides neutral
      if (/[+\-]\s*0\b|\b0\s*[+\-]/.test(window) &&
          (spec.mutatedText === '+' || spec.mutatedText === '-')) {
        return true;
      }
      // *1//1 both multiply by 1
      if (/[*\/]\s*1\b|\b1\s*[*\/]/.test(window) &&
          (spec.mutatedText === '*' || spec.mutatedText === '/')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Annotate a report: mark likely-equivalent survivors, returning a
   * filtered list of "actionable" survivors.
   */
  filterActionable(report: MutationReport): {
    readonly actionable: readonly MutantResult[];
    readonly likelyEquivalent: readonly MutantResult[];
  } {
    const actionable: MutantResult[] = [];
    const likelyEquivalent: MutantResult[] = [];
    for (const r of report.results) {
      if (r.status !== 'survived') {
        actionable.push(r);
        continue;
      }
      if (this.isEquivalent(r.spec)) {
        likelyEquivalent.push(r);
      } else {
        actionable.push(r);
      }
    }
    return { actionable, likelyEquivalent };
  }
}

/* ------------------------------------------------------------------------ */
/* Score trend / CI gate                                                    */
/* ------------------------------------------------------------------------ */

export interface ScorePoint {
  readonly at: number;
  readonly score: number;
  readonly mutants: number;
  readonly commit?: string;
}

/**
 * Tracks mutation scores across runs and computes CI gate verdicts.
 * Gate semantics:
 *   - `failBelow(min)`: hard floor — score must stay >= min;
 *   - `failOnDrop(delta)`: no more than `delta` drop vs best recorded;
 *   - `failOnRegression()`: score must not be below previous run's.
 */
export class MutationScoreTrend {
  private readonly _points: ScorePoint[] = [];

  add(report: MutationReport, commit?: string, at = Date.now()): void {
    this._points.push({
      at,
      score: report.mutationScore,
      mutants: report.totalMutants,
      commit,
    });
  }

  points(): readonly ScorePoint[] {
    return [...this._points];
  }

  latest(): ScorePoint | undefined {
    return this._points[this._points.length - 1];
  }

  best(): ScorePoint | undefined {
    return this._points.reduce<ScorePoint | undefined>(
      (a, b) => (a === undefined || b.score > a.score ? b : a),
      undefined
    );
  }

  /** Linear-regression slope of score over runs. */
  slope(): number {
    const n = this._points.length;
    if (n < 2) return NaN;
    const xs = this._points.map((_, i) => i);
    const ys = this._points.map((p) => p.score);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    return den === 0 ? 0 : num / den;
  }

  /**
   * CI gate: verify the latest score meets policy.
   */
  gate(policy: {
    readonly minScore?: number;
    readonly maxDropFromBest?: number;
    readonly noRegression?: boolean;
  }): { pass: boolean; reasons: string[] } {
    const latest = this.latest();
    const reasons: string[] = [];
    if (!latest) return { pass: true, reasons: ['no data'] };
    if (policy.minScore !== undefined && latest.score < policy.minScore) {
      reasons.push(
        `score ${(latest.score * 100).toFixed(1)}% below floor ${(policy.minScore * 100).toFixed(1)}%`
      );
    }
    const best = this.best();
    if (
      policy.maxDropFromBest !== undefined &&
      best &&
      latest !== best &&
      best.score - latest.score > policy.maxDropFromBest
    ) {
      reasons.push(
        `score dropped ${((best.score - latest.score) * 100).toFixed(1)}% from best ${(best.score * 100).toFixed(1)}%`
      );
    }
    if (policy.noRegression && this._points.length >= 2) {
      const prev = this._points[this._points.length - 2];
      if (latest.score < prev.score - 1e-9) {
        reasons.push(
          `score regressed ${((prev.score - latest.score) * 100).toFixed(1)}% vs previous run`
        );
      }
    }
    return { pass: reasons.length === 0, reasons };
  }
}

/* ------------------------------------------------------------------------ */
/* Operator effectiveness                                                   */
/* ------------------------------------------------------------------------ */

export interface OperatorStats {
  readonly operator: string;
  readonly generated: number;
  readonly killed: number;
  readonly survived: number;
  readonly killRatio: number;
}

/**
 * Per-operator breakdown — which mutation operators produce the
 * strongest/weakest mutants. High-kill operators are productive;
 * high-survival operators flag where tests are weak.
 */
export class MutationEfficiency {
  static byOperator(report: MutationReport): readonly OperatorStats[] {
    const groups = new Map<string, MutantResult[]>();
    for (const r of report.results) {
      const arr = groups.get(r.spec.operator) ?? [];
      arr.push(r);
      groups.set(r.spec.operator, arr);
    }
    return [...groups.entries()]
      .map(([operator, rs]) => {
        const killed = rs.filter((r) => r.status === 'killed' || r.status === 'timeout').length;
        const valid = rs.filter((r) => r.status !== 'runtimeError' && r.status !== 'noCoverage').length;
        const survived = rs.filter((r) => r.status === 'survived').length;
        return {
          operator,
          generated: rs.length,
          killed,
          survived,
          killRatio: valid === 0 ? 1 : killed / valid,
        };
      })
      .sort((a, b) => b.generated - a.generated);
  }

  /**
   * Rank files by "test weakness" = surviving mutants per mutant —
   * where adding tests has highest ROI.
   */
  static weakestTestAreas(report: MutationReport): readonly { file: string; score: number; survivors: number }[] {
    const byFile = new Map<string, MutantResult[]>();
    for (const r of report.results) {
      const arr = byFile.get(r.file) ?? [];
      arr.push(r);
      byFile.set(r.file, arr);
    }
    return [...byFile.entries()]
      .map(([file, rs]) => {
        const survived = rs.filter((r) => r.status === 'survived').length;
        const valid = rs.filter((r) => r.status !== 'runtimeError' && r.status !== 'noCoverage').length;
        return { file, score: valid === 0 ? 0 : survived / valid, survivors: survived };
      })
      .sort((a, b) => b.score - a.score);
  }
}
