/**
 * Star Schema Builder
 *
 * Builds a classic Kimball star schema over the columnar engine:
 *
 *   - A central fact table holding measures + degenerate foreign keys.
 *   - Surrounding dimension tables with surrogate keys (SK) generated
 *     via a hash of natural business keys — lookups in joins become
 *     integer equality on compressed columns.
 *   - Slowly Changing Dimension (SCD) Type 2 support: dimension rows
 *     carry effectiveFrom/effectiveTo plus a `current` flag; inserting a
 *     changed natural key closes the old version and opens a new one.
 *   - A join planner (`starJoin`) that resolves fact→dimension FK edges
 *     and produces joined row sets without quadratic blow-up: each
 *     dimension is materialized once into a hash table keyed by SK —
 *     O(facts + dims) total.
 *
 * @module DataWarehouse/Engine
 */

import { ColumnarTable, ColumnSchema, Row, Scalar } from './ColumnStorageEngine';

/** Dimension versioning strategy. */
export type ScdType = 'type1' | 'type2';

/** Declaration of a dimension table inside a star schema. */
export interface DimensionSpec {
  readonly name: string;
  /** Natural business key columns (e.g. ['customerEmail']). */
  readonly naturalKey: readonly string[];
  /** Attribute columns (excluding surrogate key + SCD bookkeeping). */
  readonly attributes: readonly ColumnSchema[];
  readonly scd: ScdType;
}

/** Declaration of the fact table. */
export interface FactSpec {
  readonly name: string;
  /** Measure columns (aggregatable numerics). */
  readonly measures: readonly ColumnSchema[];
  /**
   * Degenerate dimension columns kept directly on the fact table
   * (e.g. orderNumber) — no join needed.
   */
  readonly degenerateDimensions?: readonly ColumnSchema[];
}

/** Result of inserting/updating a dimension member. */
export interface DimensionUpsertResult {
  readonly surrogateKey: number;
  readonly action: 'inserted' | 'unchanged' | 'newVersion' | 'updated';
}

/* ------------------------------------------------------------------------ */
/* Dimension table                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Dimension table with surrogate keys and optional SCD-2 versioning.
 *
 * Physical layout adds three system columns on top of `attributes`:
 *   `<name>_sk`      — surrogate key (monotonically increasing int)
 *   `__eff_from`     — SCD2 validity start (ISO string / epoch ms)
 *   `__eff_to`       — SCD2 validity end, NULL when current
 *   `__current`      — boolean flag for fast current-row scans
 *
 * A natural-key index `Map<hash, sk[]>` keeps version history; joins use
 * only `__current` rows by default.
 */
export class DimensionTable {
  readonly spec: DimensionSpec;
  private readonly _table: ColumnarTable;
  private readonly _byNk = new Map<string, number[]>();
  private _nextSk = 1;
  /**
   * Append ordinal → forced effTo. The columnar engine is append-only,
   * so closing a version can't rewrite its row in place; instead we
   * record which *physical append* was superseded. Rows are scanned in
   * append order, so the result index doubles as the ordinal.
   */
  private readonly _staleOrdinals = new Map<number, number>();
  private _appendCount = 0;
  private readonly _ordinalsBySk = new Map<number, number[]>();

  constructor(spec: DimensionSpec, chunkSize = 4096) {
    this.spec = spec;
    const cols: ColumnSchema[] = [
      { name: `${spec.name}_sk`, type: 'int64', nullable: false },
      ...spec.naturalKey.map((k) => ({ name: k, type: 'string' as const, nullable: false })),
      ...spec.attributes,
      { name: '__eff_from', type: 'int64', nullable: true },
      { name: '__eff_to', type: 'int64', nullable: true },
      { name: '__current', type: 'boolean', nullable: false },
    ];
    this._table = new ColumnarTable(spec.name, cols, { chunkSize });
  }

  get table(): ColumnarTable {
    return this._table;
  }

  get surrogateKeyColumn(): string {
    return `${this.spec.name}_sk`;
  }

  private _nk(row: Row): string {
    return JSON.stringify(this.spec.naturalKey.map((k) => row[k] ?? null));
  }

  /**
   * Insert or update a member.
   *
   * - Type 1: overwrite semantics — the previous physical row is marked
   *   stale (tombstoned) and a corrected row is appended reusing the same
   *   surrogate key; reads consult the tombstone map.
   * - Type 2: close the current version (tombstone + effTo) and insert a
   *   new version with a new surrogate key.
   *
   * Because the columnar engine is append-only, updates are implemented
   * as tombstone+insert through the per-ordinal overlay `_staleOrdinals`;
   * `currentRows`/`asOf` always reflect the latest state.
   */
  upsert(member: Row, effectiveAt = Date.now()): DimensionUpsertResult {
    const nk = this._nk(member);
    const existingSks = this._byNk.get(nk) ?? [];
    const currentSk = existingSks.length > 0 ? existingSks[existingSks.length - 1] : undefined;

    if (currentSk === undefined) {
      // Brand-new member.
      const sk = this._nextSk++;
      this._append(member, sk, effectiveAt, null, true);
      this._byNk.set(nk, [sk]);
      return { surrogateKey: sk, action: 'inserted' };
    }

    // Compare attributes of current version.
    const current = this._rowBySk(currentSk);
    const changed = current === null || this.spec.attributes.some((a) => (current[a.name] ?? null) !== (member[a.name] ?? null));

    if (!changed) return { surrogateKey: currentSk, action: 'unchanged' };

    if (this.spec.scd === 'type1') {
      // Close old row, insert replacement keeping the same SK.
      this._markStale(currentSk, effectiveAt);
      this._append(member, currentSk, effectiveAt, null, true);
      return { surrogateKey: currentSk, action: 'updated' };
    }

    // SCD type 2: new version, new SK.
    this._markStale(currentSk, effectiveAt);
    const sk = this._nextSk++;
    this._append(member, sk, effectiveAt, null, true);
    const sks = this._byNk.get(nk);
    if (sks !== undefined) sks.push(sk);
    return { surrogateKey: sk, action: 'newVersion' };
  }

  private _append(member: Row, sk: number, effFrom: number | null, effTo: number | null, current: boolean): void {
    const row: Row = { [this.surrogateKeyColumn]: sk, __eff_from: effFrom, __eff_to: effTo, __current: current };
    for (const k of this.spec.naturalKey) row[k] = member[k] ?? null;
    for (const a of this.spec.attributes) {
      const v = member[a.name];
      row[a.name] = v === undefined ? null : v;
    }
    this._table.appendRow(row);
    const ordinals = this._ordinalsBySk.get(sk);
    if (ordinals === undefined) this._ordinalsBySk.set(sk, [this._appendCount]);
    else ordinals.push(this._appendCount);
    this._appendCount++;
  }

  /** Close the current physical row for `sk` at time `effTo`. */
  private _markStale(sk: number, effTo: number): void {
    const ordinals = this._ordinalsBySk.get(sk);
    if (ordinals === undefined || ordinals.length === 0) return;
    this._staleOrdinals.set(ordinals[ordinals.length - 1], effTo);
  }

  private _rowBySk(sk: number): Row | null {
    const res = this._table.scan([{ column: this.surrogateKeyColumn, op: 'eq', value: sk }]);
    return res.rows.length === 0 ? null : res.rows[res.rows.length - 1];
  }

  /**
   * Current-members view: non-superseded rows flagged `__current`.
   * Stale ordinals are excluded — for SCD-1 the replacement row reuses
   * the SK, so staleness must be tracked per physical append, not per key.
   */
  currentRows(): Row[] {
    const res = this._table.scan([]);
    const out: Row[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      if (res.rows[i].__current === true && !this._staleOrdinals.has(i)) out.push(res.rows[i]);
    }
    return out;
  }

  /** Full member history for a natural key (all versions, oldest first). */
  history(naturalKey: Row): Row[] {
    const nk = this._nk(naturalKey);
    const sks = new Set(this._byNk.get(nk) ?? []);
    const out: Row[] = [];
    const res = this._table.scan([]);
    for (const r of res.rows) {
      if (sks.has(r[this.surrogateKeyColumn] as number)) out.push(r);
    }
    return out.sort((a, b) => ((a.__eff_from as number) ?? 0) - ((b.__eff_from as number) ?? 0));
  }

  /** Members valid at a point in time (as-of query). */
  asOf(timestamp: number): Row[] {
    const res = this._table.scan([]);
    const out: Row[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows[i];
      const effTo = this._staleOrdinals.get(i) ?? (r.__eff_to as number | null);
      const effFrom = r.__eff_from as number | null;
      const from = effFrom ?? Number.MIN_SAFE_INTEGER;
      const to = effTo ?? Number.MAX_SAFE_INTEGER;
      if (timestamp >= from && timestamp < to) out.push(r);
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* Fact table                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Fact table: measures + surrogate-key FK columns named `<dim>_sk`
 * matching each joined dimension, plus optional degenerate dimensions.
 */
export class FactTable {
  readonly spec: FactSpec;
  private readonly _table: ColumnarTable;
  private readonly _dimensions: readonly string[];

  constructor(spec: FactSpec, dimensionNames: readonly string[], chunkSize = 8192) {
    this.spec = spec;
    this._dimensions = dimensionNames;
    const cols: ColumnSchema[] = [
      ...spec.measures,
      ...(spec.degenerateDimensions ?? []),
      ...dimensionNames.map((d) => ({ name: `${d}_sk`, type: 'int64' as const, nullable: false })),
    ];
    this._table = new ColumnarTable(spec.name, cols, { chunkSize });
  }

  get table(): ColumnarTable {
    return this._table;
  }

  /**
   * Insert a fact row. `fks` maps dimension name → surrogate key
   * (obtained from DimensionTable.upsert/lookup).
   */
  addFact(measures: Row, fks: Record<string, number>, degenerate?: Row): void {
    const row: Row = {};
    for (const m of this.spec.measures) {
      const v = measures[m.name];
      row[m.name] = v === undefined ? null : v;
    }
    for (const d of this._dimensions) {
      const sk = fks[d];
      if (sk === undefined) throw new Error(`Missing FK for dimension '${d}'`);
      row[`${d}_sk`] = sk;
    }
    for (const dd of this.spec.degenerateDimensions ?? []) {
      const v = degenerate?.[dd.name];
      row[dd.name] = v === undefined ? null : v;
    }
    this._table.appendRow(row);
  }
}

/* ------------------------------------------------------------------------ */
/* Star schema                                                              */
/* ------------------------------------------------------------------------ */

/**
 * The star schema: one fact + many dimensions + hash-join executor.
 *
 * `starJoin` performs the classic star-transformation: dimensions are
 * filtered first, their matching SKs collected into hash sets, then the
 * fact table is scanned once probing each set — the same bitmap-and-probe
 * strategy real warehouses use.
 */
export class StarSchema {
  readonly fact: FactTable;
  private readonly _dimensions = new Map<string, DimensionTable>();

  constructor(factSpec: FactSpec, dimensions: readonly DimensionSpec[]) {
    const names = dimensions.map((d) => d.name);
    this.fact = new FactTable(factSpec, names);
    for (const d of dimensions) this._dimensions.set(d.name, new DimensionTable(d));
  }

  dimension(name: string): DimensionTable {
    const d = this._dimensions.get(name);
    if (d === undefined) throw new Error(`Unknown dimension '${name}'`);
    return d;
  }

  dimensionNames(): string[] {
    return [...this._dimensions.keys()];
  }

  /**
   * Execute a star join.
   *
   * @param dimensionFilters per-dimension attribute predicates —
   *   `{'product': {category: 'Electronics'}}` restricts product SKs.
   * @param factPredicates   extra predicates on the fact table itself.
   * @param projection       columns to include in output; defaults to
   *   measures + all dimension attributes (prefix-free names required).
   *
   * Algorithm:
   *   1. For each filtered dimension: scan once, collect allowed SKs into
   *      a Set — O(dimRows).
   *   2. Scan fact table once; keep rows whose every SK is in the
   *      corresponding set (or whose dimension is unfiltered) — O(facts).
   *   3. Build SK→attribute map for projected dimensions — O(dimRows).
   *   4. Probe-merge: emit joined rows — O(matchingFacts × dims).
   */
  starJoin(options: {
    dimensionFilters?: Record<string, Record<string, Scalar>>;
    factPredicates?: { column: string; op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte'; value: Scalar }[];
    projection?: readonly string[];
  } = {}): Row[] {
    const { dimensionFilters = {}, factPredicates = [], projection } = options;

    // Phase 1+3: dimension hash tables (also used for final probe).
    const allowed = new Map<string, Set<number>>();
    const attrBySk = new Map<string, Map<number, Row>>();
    for (const [name, dim] of this._dimensions) {
      const filter = dimensionFilters[name];
      const skCol = dim.surrogateKeyColumn;
      const rows = dim.currentRows();
      const bySk = new Map<number, Row>();
      for (const r of rows) bySk.set(r[skCol] as number, r);
      attrBySk.set(name, bySk);

      if (filter !== undefined) {
        const set = new Set<number>();
        for (const r of rows) {
          let ok = true;
          for (const [col, val] of Object.entries(filter)) {
            if (r[col] !== val) {
              ok = false;
              break;
            }
          }
          if (ok) set.add(r[skCol] as number);
        }
        allowed.set(name, set);
      }
    }

    // Phase 2: scan facts once.
    const factRes = this.fact.table.scan(
      factPredicates.map((p) => ({ column: p.column, op: p.op, value: p.value }))
    );

    // Phase 4: probe.
    const out: Row[] = [];
    for (const fact of factRes.rows) {
      let ok = true;
      const merged: Row = {};
      for (const [name] of this._dimensions) {
        const sk = fact[`${name}_sk`] as number;
        const set = allowed.get(name);
        if (set !== undefined && !set.has(sk)) {
          ok = false;
          break;
        }
        const dimRow = attrBySk.get(name)?.get(sk);
        if (dimRow === undefined) {
          ok = false;
          break; // dangling FK — referential integrity violation
        }
        for (const a of this._dimensions.get(name)?.spec.attributes ?? []) {
          merged[`${name}.${a.name}`] = dimRow[a.name];
        }
      }
      if (!ok) continue;
      for (const m of this.fact.spec.measures) merged[`${this.fact.spec.name}.${m.name}`] = fact[m.name];
      for (const dd of this.fact.spec.degenerateDimensions ?? []) merged[dd.name] = fact[dd.name];
      out.push(merged);
    }

    if (projection === undefined) return out;
    return out.map((r) => {
      const pr: Row = {};
      for (const c of projection) pr[c] = r[c] ?? null;
      return pr;
    });
  }
}
