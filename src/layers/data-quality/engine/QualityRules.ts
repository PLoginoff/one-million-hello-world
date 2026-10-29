/**
 * Data Quality Rules Engine
 *
 * A rule evaluates a row batch and produces violations. Rules cover the
 * canonical data-quality dimensions:
 *
 *   completeness — null/blank ratio thresholds
 *   uniqueness   — duplicate detection via key hashing (exact) or
 *                  MinHash-style signature bucketing (approximate)
 *   validity     — regex, range, enum, type, format (email/iso-date)
 *   consistency  — cross-field predicates (start < end, a ⇒ b)
 *   accuracy     — value comparison against a reference dataset
 *   freshness    — staleness thresholds on timestamp columns
 *   anomaly      — statistical outliers vs. column profile (z-score)
 *
 * Each violation carries the row index, rule id, severity and a human
 * message. `QualityEngine.evaluate` runs the full rule set in one pass
 * (rows decoded once, rules applied per row — O(rows × rules)) and
 * splits records into accepted/quarantined sets by severity policy.
 *
 * @module DataQuality/Engine
 */

/** A record under evaluation. */
export type DQRow = Record<string, unknown>;

/** How bad a violation is. */
export type Severity = 'info' | 'warn' | 'error' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, error: 2, critical: 3 };

/** One rule violation against one row (rowIndex = -1 for dataset-level). */
export interface Violation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly dimension: QualityDimension;
  readonly rowIndex: number;
  readonly column?: string;
  readonly message: string;
  readonly severity: Severity;
  /** The offending value, when meaningful. */
  readonly value?: unknown;
}

export type QualityDimension =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'consistency'
  | 'accuracy'
  | 'freshness'
  | 'anomaly';

/** Per-rule result summary. */
export interface RuleResult {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly dimension: QualityDimension;
  readonly rowsEvaluated: number;
  readonly violationCount: number;
  /** violations / rowsEvaluated. */
  readonly violationRatio: number;
  readonly severity: Severity;
  readonly passed: boolean;
}

/* ------------------------------------------------------------------------ */
/* Rule interface & shared context                                          */
/* ------------------------------------------------------------------------ */

/** What a rule sees. */
export interface RuleContext {
  readonly rows: readonly DQRow[];
  /** Column profiles for anomaly rules (computed once upstream). */
  readonly profiles?: ReadonlyMap<string, ColumnProfile>;
  /** Reference datasets for accuracy rules. */
  readonly references?: ReadonlyMap<string, readonly DQRow[]>;
  readonly now: number;
}

/**
 * A quality rule. `evaluate` returns violations — dataset-level rules
 * (e.g. "null ratio < 5%") may return at most one violation with
 * rowIndex -1; row-level rules return one per offending row.
 */
export interface QualityRule {
  readonly id: string;
  readonly name: string;
  readonly dimension: QualityDimension;
  readonly severity: Severity;
  /**
   * Violation ratio above which the rule is considered "failed"
   * (vs. merely reporting violations). Default 0 — any violation fails.
   */
  readonly failureThreshold?: number;
  evaluate(ctx: RuleContext): Violation[];
}

/** Column statistics profile (input to anomaly rules). */
export interface ColumnProfile {
  readonly column: string;
  readonly count: number;
  readonly nullCount: number;
  readonly distinctCount: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stddev: number;
  readonly percentiles: ReadonlyMap<number, number>;
}

/* ------------------------------------------------------------------------ */
/* Concrete rules                                                           */
/* ------------------------------------------------------------------------ */

/** Completeness: fraction of non-null (and non-blank-string) cells must
 * reach `minRatio`. Dataset-level rule. */
export class CompletenessRule implements QualityRule {
  readonly dimension: QualityDimension = 'completeness';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly column: string,
    readonly minRatio: number,
    readonly severity: Severity = 'error',
    readonly failureThreshold = 0
  ) {}

  evaluate(ctx: RuleContext): Violation[] {
    const n = ctx.rows.length;
    if (n === 0) return [];
    let missing = 0;
    for (const r of ctx.rows) {
      const v = r[this.column];
      if (v === null || v === undefined || v === '') missing++;
    }
    const ratio = 1 - missing / n;
    if (ratio >= this.minRatio) return [];
    return [
      {
        ruleId: this.id,
        ruleName: this.name,
        dimension: this.dimension,
        rowIndex: -1,
        column: this.column,
        message: `completeness ${(ratio * 100).toFixed(1)}% < required ${(this.minRatio * 100).toFixed(1)}% (${missing}/${n} missing)`,
        severity: this.severity,
      },
    ];
  }
}

/**
 * Uniqueness: exact duplicate detection via key hashing.
 *
 * O(n): rows hashed into a Map; second and later occurrences of the same
 * key are violations. Optionally `approximate` uses normalized keys
 * (casefold + whitespace collapse) for fuzzy dedup.
 */
export class UniquenessRule implements QualityRule {
  readonly dimension: QualityDimension = 'uniqueness';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly keyColumns: readonly string[],
    readonly severity: Severity = 'error',
    readonly approximate = false,
    readonly failureThreshold = 0
  ) {}

  private _key(row: DQRow): string {
    const parts = this.keyColumns.map((c) => {
      const v = row[c];
      if (this.approximate && typeof v === 'string') {
        return v.trim().toLowerCase().replace(/\s+/g, ' ');
      }
      return v ?? null;
    });
    return JSON.stringify(parts);
  }

  evaluate(ctx: RuleContext): Violation[] {
    const seen = new Map<string, number>();
    const out: Violation[] = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      const k = this._key(ctx.rows[i]);
      const first = seen.get(k);
      if (first === undefined) {
        seen.set(k, i);
      } else {
        out.push({
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: i,
          column: this.keyColumns.join('+'),
          message: `duplicate of row ${first} on key (${this.keyColumns.join(', ')})`,
          severity: this.severity,
          value: ctx.rows[i][this.keyColumns[0]],
        });
      }
    }
    return out;
  }
}

/** Validity: each named column must satisfy its constraint. */
export type ValidityConstraint =
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'range'; min?: number; max?: number }
  | { kind: 'enum'; allowed: readonly unknown[] }
  | { kind: 'type'; type: 'string' | 'number' | 'boolean' | 'array' | 'object' }
  | { kind: 'email' }
  | { kind: 'isoDate' }
  | { kind: 'notNull' }
  | { kind: 'predicate'; test: (v: unknown) => boolean; description: string };

export class ValidityRule implements QualityRule {
  readonly dimension: QualityDimension = 'validity';
  private readonly _regex: RegExp | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly column: string,
    readonly constraint: ValidityConstraint,
    readonly severity: Severity = 'error',
    readonly failureThreshold = 0
  ) {
    if (constraint.kind === 'regex') {
      this._regex = new RegExp(constraint.pattern, constraint.flags ?? '');
    }
  }

  private _check(v: unknown): string | null {
    const c = this.constraint;
    switch (c.kind) {
      case 'regex':
        return typeof v === 'string' && this._regex !== null && this._regex.test(v) ? null : `does not match /${c.pattern}/`;
      case 'range':
        if (typeof v !== 'number') return 'not a number';
        if (c.min !== undefined && v < c.min) return `< min ${c.min}`;
        if (c.max !== undefined && v > c.max) return `> max ${c.max}`;
        return null;
      case 'enum':
        return (c.allowed as readonly unknown[]).includes(v) ? null : `not in {${c.allowed.join(', ')}}`;
      case 'type': {
        const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
        return t === c.type ? null : `type ${t} ≠ ${c.type}`;
      }
      case 'email':
        return typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'invalid email';
      case 'isoDate':
        return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : 'not an ISO date';
      case 'notNull':
        return v !== null && v !== undefined ? null : 'is null';
      case 'predicate':
        return c.test(v) ? null : c.description;
    }
  }

  evaluate(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      const v = ctx.rows[i][this.column];
      // Skip nulls unless the constraint explicitly targets them —
      // completeness rules own null checking.
      if ((v === null || v === undefined) && this.constraint.kind !== 'notNull') continue;
      const err = this._check(v);
      if (err !== null) {
        out.push({
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: i,
          column: this.column,
          message: `value ${JSON.stringify(v)} ${err}`,
          severity: this.severity,
          value: v,
        });
      }
    }
    return out;
  }
}

/** Consistency: cross-field predicate must hold per row. */
export class ConsistencyRule implements QualityRule {
  readonly dimension: QualityDimension = 'consistency';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly predicate: (row: DQRow) => boolean,
    readonly message: string,
    readonly columns: readonly string[],
    readonly severity: Severity = 'error',
    readonly failureThreshold = 0
  ) {}

  evaluate(ctx: RuleContext): Violation[] {
    const out: Violation[] = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      let ok = true;
      try {
        ok = this.predicate(ctx.rows[i]);
      } catch {
        ok = false;
      }
      if (!ok) {
        out.push({
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: i,
          column: this.columns.join('+'),
          message: this.message,
          severity: this.severity,
        });
      }
    }
    return out;
  }
}

/**
 * Accuracy: column values must exist in a reference set (foreign-key
 * style) — e.g. `country` must appear in `ref_countries.code`.
 * Builds a Set once per evaluation for O(1) probing.
 */
export class AccuracyRule implements QualityRule {
  readonly dimension: QualityDimension = 'accuracy';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly column: string,
    readonly referenceName: string,
    readonly referenceColumn: string,
    readonly severity: Severity = 'error',
    readonly failureThreshold = 0
  ) {}

  evaluate(ctx: RuleContext): Violation[] {
    const ref = ctx.references?.get(this.referenceName);
    if (ref === undefined) {
      return [
        {
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: -1,
          column: this.column,
          message: `reference dataset '${this.referenceName}' not provided`,
          severity: 'critical',
        },
      ];
    }
    const valid = new Set(ref.map((r) => r[this.referenceColumn]));
    const out: Violation[] = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      const v = ctx.rows[i][this.column];
      if (v === null || v === undefined) continue;
      if (!valid.has(v)) {
        out.push({
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: i,
          column: this.column,
          message: `${JSON.stringify(v)} not found in ${this.referenceName}.${this.referenceColumn}`,
          severity: this.severity,
          value: v,
        });
      }
    }
    return out;
  }
}

/** Freshness: max timestamp in column must be within `maxAgeMs` of now. */
export class FreshnessRule implements QualityRule {
  readonly dimension: QualityDimension = 'freshness';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly column: string,
    readonly maxAgeMs: number,
    readonly severity: Severity = 'warn',
    readonly failureThreshold = 0
  ) {}

  evaluate(ctx: RuleContext): Violation[] {
    let newest = -Infinity;
    for (const r of ctx.rows) {
      const v = r[this.column];
      const t = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
      if (!Number.isNaN(t) && t > newest) newest = t;
    }
    if (newest === -Infinity) {
      return [
        {
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: -1,
          column: this.column,
          message: 'no parseable timestamps found',
          severity: this.severity,
        },
      ];
    }
    const age = ctx.now - newest;
    if (age <= this.maxAgeMs) return [];
    return [
      {
        ruleId: this.id,
        ruleName: this.name,
        dimension: this.dimension,
        rowIndex: -1,
        column: this.column,
        message: `data is ${(age / 60000).toFixed(1)}min old; max allowed ${(this.maxAgeMs / 60000).toFixed(1)}min`,
        severity: this.severity,
      },
    ];
  }
}

/**
 * Anomaly rule: z-score outliers on a numeric column.
 * Requires a ColumnProfile (computed upstream by `profileColumns`);
 * flags rows with |v - mean| > threshold·stddev.
 */
export class AnomalyRule implements QualityRule {
  readonly dimension: QualityDimension = 'anomaly';
  constructor(
    readonly id: string,
    readonly name: string,
    readonly column: string,
    readonly zThreshold: number,
    readonly severity: Severity = 'warn',
    readonly failureThreshold = 0
  ) {}

  evaluate(ctx: RuleContext): Violation[] {
    const profile = ctx.profiles?.get(this.column);
    if (profile === undefined || profile.stddev === 0) return [];
    const out: Violation[] = [];
    for (let i = 0; i < ctx.rows.length; i++) {
      const v = ctx.rows[i][this.column];
      if (typeof v !== 'number') continue;
      const z = Math.abs(v - profile.mean) / profile.stddev;
      if (z > this.zThreshold) {
        out.push({
          ruleId: this.id,
          ruleName: this.name,
          dimension: this.dimension,
          rowIndex: i,
          column: this.column,
          message: `z-score ${z.toFixed(2)} > ${this.zThreshold} (value ${v}, mean ${profile.mean.toFixed(2)})`,
          severity: this.severity,
          value: v,
        });
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* Profiler                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Single-pass column profiler.
 *
 * Numeric columns get Welford variance + a sorted-value reservoir for
 * percentiles; all columns get null count + distinct estimate. O(rows)
 * time, O(columnValues) worst-case memory for the percentile reservoir
 * (bounded by `reservoirSize` via reservoir sampling when exceeded).
 */
export class ColumnProfiler {
  private readonly _reservoirSize: number;

  constructor(opts: { reservoirSize?: number } = {}) {
    this._reservoirSize = opts.reservoirSize ?? 4096;
  }

  profile(rows: readonly DQRow[], columns: readonly string[]): Map<string, ColumnProfile> {
    const out = new Map<string, ColumnProfile>();
    for (const col of columns) {
      let count = 0;
      let nullCount = 0;
      let n = 0;
      let mean = 0;
      let m2 = 0;
      let min = Infinity;
      let max = -Infinity;
      const distinct = new Set<unknown>();
      const numeric: number[] = [];
      for (const r of rows) {
        count++;
        const v = r[col];
        if (v === null || v === undefined) {
          nullCount++;
          continue;
        }
        distinct.add(v);
        if (typeof v === 'number') {
          n++;
          const delta = v - mean;
          mean += delta / n;
          m2 += delta * (v - mean);
          if (v < min) min = v;
          if (v > max) max = v;
          if (numeric.length < this._reservoirSize) {
            numeric.push(v);
          } else {
            // Reservoir sample to bound memory.
            const j = Math.floor(Math.random() * n);
            if (j < this._reservoirSize) numeric[j] = v;
          }
        }
      }
      numeric.sort((a, b) => a - b);
      const pct = new Map<number, number>();
      for (const p of [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]) {
        if (numeric.length > 0) {
          const idx = Math.min(numeric.length - 1, Math.max(0, Math.ceil(p * numeric.length) - 1));
          pct.set(p, numeric[idx]);
        }
      }
      out.set(col, {
        column: col,
        count,
        nullCount,
        distinctCount: distinct.size,
        min: n === 0 ? NaN : min,
        max: n === 0 ? NaN : max,
        mean: n === 0 ? NaN : mean,
        stddev: n < 2 ? 0 : Math.sqrt(m2 / n),
        percentiles: pct,
      });
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* Engine                                                                   */
/* ------------------------------------------------------------------------ */

/** Severity at-or-above which violating rows are quarantined. */
export interface QuarantinePolicy {
  readonly quarantineAt: Severity;
  /** Row-level rules quarantine individual rows; dataset-level rules
   * (rowIndex -1) never quarantine — they fail the batch instead. */
}

/** Evaluation result. */
export interface QualityReport {
  readonly rowsEvaluated: number;
  readonly rulesEvaluated: number;
  readonly violations: Violation[];
  readonly ruleResults: RuleResult[];
  /** Indexes of rows quarantined by severity policy. */
  readonly quarantinedRows: number[];
  /** Indexes of rows that passed all quarantining rules. */
  readonly acceptedRows: number[];
  /** 0–100 weighted quality score (higher = better). */
  readonly score: number;
  readonly status: 'pass' | 'warn' | 'fail';
}

/**
 * Scoring: each rule contributes weight 1; a rule's deduction is its
 * violation ratio scaled by severity weight (info .25, warn .5,
 * error .75, critical 1.0). Dataset-level violations count as ratio 1.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = { info: 0.25, warn: 0.5, error: 0.75, critical: 1 };

export class QualityEngine {
  private readonly _rules: QualityRule[] = [];
  private readonly _profiler = new ColumnProfiler();
  private _policy: QuarantinePolicy = { quarantineAt: 'error' };

  addRule(rule: QualityRule): this {
    this._rules.push(rule);
    return this;
  }

  addRules(rules: readonly QualityRule[]): this {
    for (const r of rules) this._rules.push(r);
    return this;
  }

  setQuarantinePolicy(policy: QuarantinePolicy): this {
    this._policy = policy;
    return this;
  }

  get rules(): readonly QualityRule[] {
    return this._rules;
  }

  /**
   * Evaluate all rules against the batch.
   *
   * Pass 1 profiles numeric columns referenced by anomaly rules;
   * Pass 2 evaluates every rule; Pass 3 splits rows into
   * accepted/quarantined by severity.
   */
  evaluate(
    rows: readonly DQRow[],
    opts: { references?: ReadonlyMap<string, readonly DQRow[]>; now?: number; profileColumns?: readonly string[] } = {}
  ): QualityReport {
    const profileCols = opts.profileColumns ?? this._rules.filter((r) => r instanceof AnomalyRule).map((r) => (r as AnomalyRule).column);
    const profiles = this._profiler.profile(rows, profileCols);
    const ctx: RuleContext = {
      rows,
      profiles,
      references: opts.references,
      now: opts.now ?? Date.now(),
    };

    const violations: Violation[] = [];
    const ruleResults: RuleResult[] = [];
    for (const rule of this._rules) {
      const vs = rule.evaluate(ctx);
      violations.push(...vs);
      const ratio = rows.length === 0 ? 0 : vs.filter((v) => v.rowIndex >= 0).length / rows.length;
      const hasDatasetViolation = vs.some((v) => v.rowIndex === -1);
      const threshold = rule.failureThreshold ?? 0;
      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        dimension: rule.dimension,
        rowsEvaluated: rows.length,
        violationCount: vs.length,
        violationRatio: ratio,
        severity: rule.severity,
        passed: !(hasDatasetViolation || ratio > threshold),
      });
    }

    // Quarantine rows hit by row-level violations at/above threshold.
    const quarantined = new Set<number>();
    for (const v of violations) {
      if (v.rowIndex >= 0 && SEVERITY_RANK[v.severity] >= SEVERITY_RANK[this._policy.quarantineAt]) {
        quarantined.add(v.rowIndex);
      }
    }
    const accepted: number[] = [];
    for (let i = 0; i < rows.length; i++) if (!quarantined.has(i)) accepted.push(i);

    // Score: 100 − Σ(weight·ratio·100)/#rules.
    let score = 100;
    for (const rr of ruleResults) {
      const effectiveRatio = rr.violationCount > 0 && rr.violationRatio === 0 ? 1 : rr.violationRatio;
      score -= effectiveRatio * SEVERITY_WEIGHT[rr.severity] * (100 / Math.max(1, ruleResults.length));
    }
    score = Math.max(0, Math.round(score * 10) / 10);

    const worst = ruleResults.reduce((w, r) => (r.passed ? w : Math.max(w, SEVERITY_RANK[r.severity])), 0);
    const status = worst >= SEVERITY_RANK.error ? 'fail' : worst >= SEVERITY_RANK.warn ? 'warn' : 'pass';

    return {
      rowsEvaluated: rows.length,
      rulesEvaluated: this._rules.length,
      violations,
      ruleResults,
      quarantinedRows: [...quarantined].sort((a, b) => a - b),
      acceptedRows: accepted,
      score,
      status,
    };
  }

  /** Split a batch into (accepted, quarantined) row sets. */
  partition(rows: readonly DQRow[], report: QualityReport): { accepted: DQRow[]; quarantined: Array<{ row: DQRow; violations: Violation[] }> } {
    const accepted = report.acceptedRows.map((i) => rows[i]);
    const quarantined = report.quarantinedRows.map((i) => ({
      row: rows[i],
      violations: report.violations.filter((v) => v.rowIndex === i),
    }));
    return { accepted, quarantined };
  }
}
