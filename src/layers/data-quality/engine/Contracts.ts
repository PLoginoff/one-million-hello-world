/**
 * Data Contracts & Expectation DSL
 *
 * A *data contract* declaratively describes what a dataset must look
 * like — schema expectations plus quality constraints — and compiles
 * into the concrete `QualityRule` set evaluated by `QualityEngine`.
 *
 * Think Great-Expectations-style suites expressed as data:
 *
 *   const contract = defineContract('orders')
 *     .column('id', c => c.notNull().unique())
 *     .column('email', c => c.email().notNull())
 *     .column('amount', c => c.range(0, 1_000_000))
 *     .rowLevel(r => r.expect('startBeforeEnd', row => row.start < row.end))
 *     .freshness('updated_at', 3600_000)
 *     .build();
 *   const report = engine.evaluate(rows, contract.toRules());
 *
 * Contracts also carry metadata (owner, SLA, description) so a catalog
 * can render them, and `ContractValidator` produces a diff report
 * between declared schema and observed columns (schema drift check).
 *
 * @module DataQuality/Engine
 */

import {
  AccuracyRule,
  CompletenessRule,
  ConsistencyRule,
  FreshnessRule,
  DQRow,
  QualityRule,
  Severity,
  UniquenessRule,
  ValidityRule,
} from './QualityRules';

/* ------------------------------------------------------------------------ */
/* Column expectation builder                                               */
/* ------------------------------------------------------------------------ */

/** Declarative column constraint — compiled into 0..n rules. */
export interface ColumnContract {
  readonly name: string;
  readonly rules: QualityRule[];
  readonly expectedType?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly required: boolean;
  readonly description?: string;
}

/** Fluent builder for one column's expectations. */
export class ColumnBuilder {
  private readonly _contract: string;
  readonly name: string;
  private readonly _rules: QualityRule[] = [];
  private _required = false;
  private _type: ColumnContract['expectedType'] | undefined;
  private _desc: string | undefined;
  private readonly _severity: Severity;

  constructor(contractName: string, column: string, severity: Severity) {
    this._contract = contractName;
    this.name = column;
    this._severity = severity;
  }

  private _id(suffix: string): string {
    return `${this._contract}.${this.name}.${suffix}`;
  }

  /** Column must be non-null in ≥ `ratio` of rows (default 1.0). */
  notNull(ratio = 1): this {
    this._required = ratio >= 1;
    this._rules.push(new CompletenessRule(this._id('notNull'), `${this.name} complete`, this.name, ratio, this._severity));
    return this;
  }

  /** Column values must be unique (exact or normalized). */
  unique(opts: { approximate?: boolean } = {}): this {
    this._rules.push(new UniquenessRule(this._id('unique'), `${this.name} unique`, [this.name], this._severity, opts.approximate ?? false));
    return this;
  }

  /** Regex constraint. */
  matches(pattern: string | RegExp): this {
    const p = pattern instanceof RegExp ? pattern.source : pattern;
    const flags = pattern instanceof RegExp ? pattern.flags : undefined;
    this._rules.push(new ValidityRule(this._id('regex'), `${this.name} matches /${p}/`, this.name, { kind: 'regex', pattern: p, flags }, this._severity));
    return this;
  }

  /** Email format. */
  email(): this {
    this._rules.push(new ValidityRule(this._id('email'), `${this.name} email`, this.name, { kind: 'email' }, this._severity));
    return this;
  }

  /** ISO-8601 date string. */
  isoDate(): this {
    this._rules.push(new ValidityRule(this._id('isodate'), `${this.name} iso date`, this.name, { kind: 'isoDate' }, this._severity));
    return this;
  }

  /** Numeric range. */
  range(min?: number, max?: number): this {
    this._rules.push(new ValidityRule(this._id('range'), `${this.name} in [${min ?? '-∞'},${max ?? '∞'}]`, this.name, { kind: 'range', min, max }, this._severity));
    return this;
  }

  /** Enum of allowed values. */
  oneOf(allowed: readonly unknown[]): this {
    this._rules.push(new ValidityRule(this._id('enum'), `${this.name} enum`, this.name, { kind: 'enum', allowed }, this._severity));
    return this;
  }

  /** Primitive type expectation — also recorded as schema expectation. */
  type(t: 'string' | 'number' | 'boolean' | 'array' | 'object'): this {
    this._type = t;
    this._rules.push(new ValidityRule(this._id('type'), `${this.name} is ${t}`, this.name, { kind: 'type', type: t }, this._severity));
    return this;
  }

  /** Values must appear in a reference dataset's column. */
  inReference(dataset: string, column: string): this {
    this._rules.push(new AccuracyRule(this._id('ref'), `${this.name} ∈ ${dataset}.${column}`, this.name, dataset, column, this._severity));
    return this;
  }

  /** Arbitrary predicate. */
  predicate(description: string, test: (v: unknown) => boolean): this {
    this._rules.push(new ValidityRule(this._id('pred'), `${this.name} ${description}`, this.name, { kind: 'predicate', test, description }, this._severity));
    return this;
  }

  /** Free-text description (metadata only). */
  describe(text: string): this {
    this._desc = text;
    return this;
  }

  /** Compile to a ColumnContract. */
  build(): ColumnContract {
    return { name: this.name, rules: this._rules.slice(), expectedType: this._type, required: this._required, description: this._desc };
  }
}

/* ------------------------------------------------------------------------ */
/* Contract                                                                 */
/* ------------------------------------------------------------------------ */

/** A compiled contract: metadata + rules + schema expectations. */
export interface DataContract {
  readonly name: string;
  readonly owner?: string;
  readonly sla?: { maxFreshnessMs?: number; minScore?: number };
  readonly columns: readonly ColumnContract[];
  readonly rules: readonly QualityRule[];
  readonly description?: string;
}

/** Fluent contract builder. */
export class ContractBuilder {
  private readonly _name: string;
  private _owner: string | undefined;
  private _desc: string | undefined;
  private _sla: DataContract['sla'] | undefined;
  private readonly _columns: ColumnContract[] = [];
  private readonly _extraRules: QualityRule[] = [];
  private readonly _defaultSeverity: Severity;

  constructor(name: string, defaultSeverity: Severity = 'error') {
    this._name = name;
    this._defaultSeverity = defaultSeverity;
  }

  owner(o: string): this {
    this._owner = o;
    return this;
  }

  describe(d: string): this {
    this._desc = d;
    return this;
  }

  sla(s: NonNullable<DataContract['sla']>): this {
    this._sla = s;
    return this;
  }

  /** Declare a column with expectations via the builder callback. */
  column(name: string, configure?: (c: ColumnBuilder) => ColumnBuilder | void, severity?: Severity): this {
    const b = new ColumnBuilder(this._name, name, severity ?? this._defaultSeverity);
    if (configure !== undefined) configure(b);
    this._columns.push(b.build());
    return this;
  }

  /** Row-level expectation (consistency). */
  rowLevel(ruleId: string, description: string, predicate: (row: DQRow) => boolean, columns: readonly string[] = [], severity?: Severity): this {
    this._extraRules.push(new ConsistencyRule(`${this._name}.${ruleId}`, description, predicate, description, columns, severity ?? this._defaultSeverity));
    return this;
  }

  /** Freshness SLA on a timestamp column. */
  freshness(column: string, maxAgeMs: number, severity?: Severity): this {
    this._extraRules.push(new FreshnessRule(`${this._name}.freshness.${column}`, `${column} fresh within ${maxAgeMs}ms`, column, maxAgeMs, severity ?? 'warn'));
    return this;
  }

  /** Multi-column uniqueness. */
  uniqueTogether(columns: readonly string[], severity?: Severity): this {
    this._extraRules.push(new UniquenessRule(`${this._name}.unique.${columns.join('+')}`, `${columns.join('+')} unique together`, columns, severity ?? this._defaultSeverity));
    return this;
  }

  build(): DataContract {
    const rules: QualityRule[] = [];
    for (const c of this._columns) rules.push(...c.rules);
    rules.push(...this._extraRules);
    return { name: this._name, owner: this._owner, sla: this._sla, columns: this._columns, rules, description: this._desc };
  }
}

/** Entry point: `defineContract('orders')…`. */
export function defineContract(name: string, defaultSeverity: Severity = 'error'): ContractBuilder {
  return new ContractBuilder(name, defaultSeverity);
}

/* ------------------------------------------------------------------------ */
/* Schema drift check                                                       */
/* ------------------------------------------------------------------------ */

/** Difference between the contract schema and observed data. */
export interface SchemaDriftReport {
  /** Contract columns never seen in the data. */
  readonly missingColumns: string[];
  /** Data columns not declared in the contract. */
  readonly unexpectedColumns: string[];
  /** Declared columns whose observed runtime types contradict `type()`. */
  readonly typeMismatches: Array<{ column: string; expected: string; observed: string[] }>;
  readonly conforming: boolean;
}

/**
 * Compare a contract's column declarations with observed row keys/types.
 * Type observation: scan up to `sampleSize` rows and collect the runtime
 * type set per column.
 */
export function checkSchemaConformance(contract: DataContract, rows: readonly DQRow[], sampleSize = 100): SchemaDriftReport {
  const observed = new Map<string, Set<string>>();
  const n = Math.min(rows.length, sampleSize);
  for (let i = 0; i < n; i++) {
    for (const [k, v] of Object.entries(rows[i])) {
      const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      const set = observed.get(k);
      if (set === undefined) observed.set(k, new Set([t]));
      else set.add(t);
    }
  }
  const declared = new Set(contract.columns.map((c) => c.name));
  const missing = contract.columns.filter((c) => !observed.has(c.name)).map((c) => c.name);
  const unexpected = [...observed.keys()].filter((k) => !declared.has(k));
  const typeMismatches: SchemaDriftReport['typeMismatches'] = [];
  for (const col of contract.columns) {
    if (col.expectedType === undefined) continue;
    const seen = observed.get(col.name);
    if (seen === undefined) continue;
    const nonNull = [...seen].filter((t) => t !== 'null');
    if (nonNull.length === 0) continue;
    if (!nonNull.every((t) => t === col.expectedType)) {
      typeMismatches.push({ column: col.name, expected: col.expectedType, observed: nonNull });
    }
  }
  // Required-but-missing is a mismatch too (captured via missingColumns).
  return { missingColumns: missing, unexpectedColumns: unexpected, typeMismatches, conforming: missing.length === 0 && unexpected.length === 0 && typeMismatches.length === 0 };
}
