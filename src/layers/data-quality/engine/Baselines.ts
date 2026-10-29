/**
 * Adaptive Baselines & Rule Catalog
 *
 * BaselineStore
 * -------------
 * Learns "normal" column statistics from historical batches and flags
 * drift beyond learned tolerance — adaptive anomaly detection without
 * hand-tuned thresholds:
 *
 *   - For each (table, column) the store keeps a rolling window of
 *     observed metrics (null ratio, distinct ratio, mean, stddev,
 *     min/max, top values).
 *   - `deviation(current)` reports per-metric z-scores against the
 *     learned baseline (EWMA-smoothed so old batches decay).
 *   - `suggestRules` emits ready-made QualityRules with thresholds
 *     derived from the baseline (e.g. null-ratio tolerance = observed
 *     mean + 3σ).
 *
 * RuleCatalog
 * -----------
 * A registry of named rule *templates* parameterized per use-site —
 * the library a team maintains once and reuses across datasets.
 *
 * @module DataQuality/Engine
 */

import { CompletenessRule, DQRow, QualityRule, Severity, UniquenessRule, ValidityRule } from './QualityRules';
import { ColumnProfiler, ColumnProfile } from './QualityRules';

/* ------------------------------------------------------------------------ */
/* Baseline metrics                                                         */
/* ------------------------------------------------------------------------ */

/** Metrics captured per column per observation. */
export interface ColumnMetrics {
  readonly nullRatio: number;
  readonly distinctRatio: number;
  readonly mean: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
  readonly rowCount: number;
}

function metricsOf(profile: ColumnProfile, rowCount: number): ColumnMetrics {
  return {
    nullRatio: rowCount === 0 ? 0 : profile.nullCount / rowCount,
    distinctRatio: profile.count === 0 ? 0 : profile.distinctCount / profile.count,
    mean: profile.mean,
    stddev: profile.stddev,
    min: profile.min,
    max: profile.max,
    rowCount,
  };
}

/** EWMA-smoothed learned baseline for one metric. */
interface LearnedBaseline {
  mean: number;
  m2: number;
  samples: number;
}

function updateBaseline(b: LearnedBaseline | null, value: number, alpha: number): LearnedBaseline {
  if (b === null || !Number.isFinite(value)) {
    return b === null ? { mean: value, m2: 0, samples: 1 } : b;
  }
  // EWMA for mean; EWMA of squared deviation for variance.
  const dev = value - b.mean;
  return {
    mean: b.mean + alpha * dev,
    m2: (1 - alpha) * (b.m2 + alpha * dev * dev),
    samples: b.samples + 1,
  };
}

function baselineStd(b: LearnedBaseline): number {
  return Math.sqrt(Math.max(0, b.m2));
}

/* ------------------------------------------------------------------------ */
/* Baseline store                                                           */
/* ------------------------------------------------------------------------ */

/** Deviation report for one column in the newest batch. */
export interface MetricDeviation {
  readonly metric: keyof ColumnMetrics;
  readonly observed: number;
  readonly expectedMean: number;
  readonly expectedStddev: number;
  /** |observed − mean| / stddev; Infinity when stddev = 0 and they differ. */
  readonly zScore: number;
  readonly anomalous: boolean;
}

/** Per-column deviation report. */
export interface ColumnDeviationReport {
  readonly column: string;
  readonly deviations: MetricDeviation[];
  readonly worstZ: number;
  readonly anomalous: boolean;
}

/**
 * Learns and consults column-metric baselines per (table, column).
 */
export class BaselineStore {
  private readonly _alpha: number;
  private readonly _zThreshold: number;
  /** table → column → metric → baseline */
  private readonly _baselines = new Map<string, Map<string, Map<keyof ColumnMetrics, LearnedBaseline>>>();

  constructor(opts: { smoothing?: number; zThreshold?: number } = {}) {
    this._alpha = opts.smoothing ?? 0.3;
    this._zThreshold = opts.zThreshold ?? 3;
  }

  private _cell(table: string, column: string): Map<keyof ColumnMetrics, LearnedBaseline> {
    let t = this._baselines.get(table);
    if (t === undefined) {
      t = new Map();
      this._baselines.set(table, t);
    }
    let c = t.get(column);
    if (c === undefined) {
      c = new Map();
      t.set(column, c);
    }
    return c;
  }

  /**
   * Observe a batch: update learned baselines. Call with each periodic
   * run (e.g. daily partition) — the EWMA weights recent runs higher.
   */
  observe(table: string, rows: readonly DQRow[], columns: readonly string[]): void {
    const profiler = new ColumnProfiler();
    const profiles = profiler.profile(rows, columns);
    for (const col of columns) {
      const p = profiles.get(col);
      if (p === undefined) continue;
      const m = metricsOf(p, rows.length);
      const cell = this._cell(table, col);
      for (const [k, v] of Object.entries(m) as Array<[keyof ColumnMetrics, number]>) {
        cell.set(k, updateBaseline(cell.get(k) ?? null, v, this._alpha));
      }
    }
  }

  /**
   * Score a new batch against the learned baseline. Columns with no
   * baseline are skipped (learning hasn't happened yet).
   */
  deviation(table: string, rows: readonly DQRow[], columns: readonly string[]): ColumnDeviationReport[] {
    const profiler = new ColumnProfiler();
    const profiles = profiler.profile(rows, columns);
    const out: ColumnDeviationReport[] = [];
    for (const col of columns) {
      const cell = this._baselines.get(table)?.get(col);
      const p = profiles.get(col);
      if (cell === undefined || p === undefined) continue;
      const m = metricsOf(p, rows.length);
      const deviations: MetricDeviation[] = [];
      let worst = 0;
      for (const [k, observed] of Object.entries(m) as Array<[keyof ColumnMetrics, number]>) {
        const b = cell.get(k);
        if (b === undefined || b.samples < 2) continue;
        const sd = baselineStd(b);
        let z: number;
        if (sd === 0) {
          z = observed === b.mean ? 0 : Infinity;
        } else {
          z = Math.abs(observed - b.mean) / sd;
        }
        if (z > worst && Number.isFinite(z)) worst = z;
        if (z === Infinity) worst = Infinity;
        deviations.push({ metric: k, observed, expectedMean: b.mean, expectedStddev: sd, zScore: z, anomalous: z > this._zThreshold });
      }
      out.push({ column: col, deviations, worstZ: worst, anomalous: deviations.some((d) => d.anomalous) });
    }
    return out;
  }

  /**
   * Generate QualityRules from the learned baseline for a column:
   * completeness tolerance = mean nullRatio + z·σ (floored at some
   * minimum slack so tiny σ doesn't over-alert).
   */
  suggestRules(table: string, column: string, opts: { severity?: Severity; minNullTolerance?: number } = {}): QualityRule[] {
    const cell = this._baselines.get(table)?.get(column);
    if (cell === undefined) return [];
    const rules: QualityRule[] = [];
    const severity = opts.severity ?? 'warn';
    const nullB = cell.get('nullRatio');
    if (nullB !== undefined && nullB.samples >= 2) {
      const tolerance = Math.min(1, Math.max(opts.minNullTolerance ?? 0.01, nullB.mean + this._zThreshold * baselineStd(nullB)));
      rules.push(new CompletenessRule(`baseline.${table}.${column}.null`, `${column} null-ratio ≤ ${tolerance.toFixed(3)} (learned)`, column, 1 - tolerance, severity));
    }
    const minB = cell.get('min');
    const maxB = cell.get('max');
    if (minB !== undefined && maxB !== undefined && minB.samples >= 2 && Number.isFinite(minB.mean) && Number.isFinite(maxB.mean)) {
      const lo = minB.mean - this._zThreshold * baselineStd(minB);
      const hi = maxB.mean + this._zThreshold * baselineStd(maxB);
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi) {
        rules.push(new ValidityRule(`baseline.${table}.${column}.range`, `${column} within learned [${lo.toFixed(2)}, ${hi.toFixed(2)}]`, column, { kind: 'range', min: lo, max: hi }, severity));
      }
    }
    return rules;
  }
}

/* ------------------------------------------------------------------------ */
/* Rule catalog                                                             */
/* ------------------------------------------------------------------------ */

/** A parameterized rule template. */
export interface RuleTemplate<P = Record<string, unknown>> {
  readonly id: string;
  readonly description: string;
  readonly parameters: readonly string[];
  readonly build: (params: P) => QualityRule;
}

/**
 * Catalog of reusable rule templates with a small built-in library.
 */
export class RuleCatalog {
  private readonly _templates = new Map<string, RuleTemplate<never>>();

  register<P extends Record<string, unknown>>(t: RuleTemplate<P>): this {
    this._templates.set(t.id, t as RuleTemplate<never>);
    return this;
  }

  get(id: string): RuleTemplate<never> | undefined {
    return this._templates.get(id);
  }

  list(): Array<{ id: string; description: string; parameters: readonly string[] }> {
    return [...this._templates.values()].map((t) => ({ id: t.id, description: t.description, parameters: t.parameters }));
  }

  /** Instantiate a rule from the catalog. */
  instantiate<P extends Record<string, unknown>>(id: string, params: P): QualityRule {
    const t = this._templates.get(id);
    if (t === undefined) throw new Error(`Unknown rule template '${id}'`);
    for (const p of t.parameters) {
      if (!(p in params)) throw new Error(`Missing parameter '${p}' for template '${id}'`);
    }
    return (t.build as (params: Record<string, unknown>) => QualityRule)(params);
  }

  /** Standard library of templates. */
  static standard(): RuleCatalog {
    const c = new RuleCatalog();
    c.register({
      id: 'completeness',
      description: 'Column must be non-null in ≥ minRatio of rows',
      parameters: ['column', 'minRatio'],
      build: (p) => new CompletenessRule('tpl.completeness', `${String(p.column)} complete`, String(p.column), Number(p.minRatio), (p.severity as Severity) ?? 'error'),
    });
    c.register({
      id: 'uniqueness',
      description: 'Key columns must be unique',
      parameters: ['columns'],
      build: (p) => new UniquenessRule('tpl.uniqueness', `${(p.columns as string[]).join('+')} unique`, p.columns as string[], (p.severity as Severity) ?? 'error'),
    });
    c.register({
      id: 'range',
      description: 'Numeric column within [min,max]',
      parameters: ['column'],
      build: (p) =>
        new ValidityRule('tpl.range', `${String(p.column)} range`, String(p.column), { kind: 'range', min: p.min as number | undefined, max: p.max as number | undefined }, (p.severity as Severity) ?? 'error'),
    });
    c.register({
      id: 'enum',
      description: 'Column value ∈ allowed set',
      parameters: ['column', 'allowed'],
      build: (p) => new ValidityRule('tpl.enum', `${String(p.column)} enum`, String(p.column), { kind: 'enum', allowed: p.allowed as unknown[] }, (p.severity as Severity) ?? 'error'),
    });
    c.register({
      id: 'regex',
      description: 'Column matches regex',
      parameters: ['column', 'pattern'],
      build: (p) => new ValidityRule('tpl.regex', `${String(p.column)} regex`, String(p.column), { kind: 'regex', pattern: String(p.pattern), flags: p.flags as string | undefined }, (p.severity as Severity) ?? 'error'),
    });
    return c;
  }
}
