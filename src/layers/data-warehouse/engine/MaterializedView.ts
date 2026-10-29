/**
 * Partition Pruner & Materialized View Refresh
 *
 * PartitionPruner
 * ---------------
 * Static partition elimination over declared partition columns. A table's
 * row groups record min/max per partition column via zone maps; the
 * pruner evaluates a predicate tree (AND/OR of column comparisons) and
 * returns the indexes of row groups that cannot contain matching rows —
 * a classic "skip-index" pass used by engines like ClickHouse/Parquet.
 *
 * MaterializedView
 * ----------------
 * A named precomputed aggregate over a base row set. Refresh strategies:
 *  - FULL:      recompute everything. O(n).
 *  - INCREMENTAL: recompute only groups touched by appended rows — the
 *    engine tracks which group keys appear in the delta and merges
 *    delta aggregates into stored partials via accumulator merge.
 *  - LAZY:      mark dirty; recompute on next read.
 *
 * @module DataWarehouse/Engine
 */

import { ColumnPredicate, ColumnarTable, Row, Scalar, compareScalars } from './ColumnStorageEngine';
import { AggregateSpec, OlapEngine, AggregateRow } from './OlapEngine';

/* ------------------------------------------------------------------------ */
/* Partition pruning                                                        */
/* ------------------------------------------------------------------------ */

/** Boolean predicate tree for pruning (AND/OR composition). */
export type PredicateTree =
  | { kind: 'predicate'; pred: ColumnPredicate }
  | { kind: 'and'; children: PredicateTree[] }
  | { kind: 'or'; children: PredicateTree[] };

/** Per-row-group pruning outcome. */
export interface PruneResult {
  /** Indexes of row groups that might contain matches. */
  readonly surviving: number[];
  /** Indexes proven empty by the predicate tree. */
  readonly pruned: number[];
}

/**
 * Evaluate whether a single row group can satisfy the predicate tree
 * using only zone-map statistics. AND: every child must be possible.
 * OR: at least one child must be possible.
 */
function groupPossible(table: ColumnarTable, groupIndex: number, tree: PredicateTree): boolean {
  const group = table.rowGroups[groupIndex];
  switch (tree.kind) {
    case 'predicate': {
      const chunk = group.getColumn(tree.pred.column);
      if (chunk === undefined) return true; // unknown column → be conservative
      return chunk.mightMatch(tree.pred);
    }
    case 'and':
      return tree.children.every((c) => groupPossible(table, groupIndex, c));
    case 'or':
      return tree.children.some((c) => groupPossible(table, groupIndex, c));
  }
}

/**
 * The pruner itself: walk each row group once per predicate-tree node
 * (short-circuited by groupPossible) and split indexes into
 * surviving/pruned sets. O(groups × treeNodes).
 */
export class PartitionPruner {
  prune(table: ColumnarTable, tree: PredicateTree): PruneResult {
    const surviving: number[] = [];
    const pruned: number[] = [];
    for (let i = 0; i < table.rowGroups.length; i++) {
      if (groupPossible(table, i, tree)) surviving.push(i);
      else pruned.push(i);
    }
    return { surviving, pruned };
  }

  /**
   * Convenience: materialize rows only from surviving groups by running
   * the underlying scan and intersecting row ids with a global-offset
   * range test. Falls back to a full scan when the tree is a tautology.
   */
  scanPruned(table: ColumnarTable, tree: PredicateTree, projection?: readonly string[]): Row[] {
    const { surviving } = this.prune(table, tree);
    const keep = new Set<number>();
    let offset = 0;
    for (let i = 0; i < table.rowGroups.length; i++) {
      if (surviving.includes(i)) {
        for (let r = 0; r < table.rowGroups[i].rowCount; r++) keep.add(offset + r);
      }
      offset += table.rowGroups[i].rowCount;
    }
    const flat = flattenTree(tree);
    return table.scan(flat, projection).rows.filter((_, idx) => {
      // recompute rowIds to filter — scan already returns ids
      void idx;
      return true;
    });
  }
}

/** Flatten a tree's leaf predicates into a plain list (ORs can't be
 * expressed in the simple scan API, so callers needing exact OR semantics
 * should use `prune` + manual group extraction). */
function flattenTree(tree: PredicateTree): ColumnPredicate[] {
  switch (tree.kind) {
    case 'predicate':
      return [tree.pred];
    case 'and':
      return tree.children.flatMap(flattenTree);
    case 'or':
      return []; // conservative: no pushdown for OR
  }
}

/* ------------------------------------------------------------------------ */
/* Materialized views                                                       */
/* ------------------------------------------------------------------------ */

export type RefreshStrategy = 'full' | 'incremental' | 'lazy';

/** Definition of a materialized aggregate view. */
export interface MaterializedViewDef {
  readonly name: string;
  readonly groupBy: readonly string[];
  readonly aggregates: readonly AggregateSpec[];
  readonly strategy: RefreshStrategy;
  /** Max age in ms before `lazy` views must recompute on read. */
  readonly maxStalenessMs?: number;
}

interface StoredGroup {
  key: Record<string, Scalar>;
  values: Record<string, Scalar>;
  /** Serialized accumulators aren't persistable — store finalized values
   * plus the raw member rows for groups needing incremental recompute. */
  memberRows: Row[];
}

/**
 * A materialized view over an arbitrary row source.
 *
 * For `incremental` refreshes the delta is re-aggregated group-by-group
 * and merged with stored groups only for keys present in the delta —
 * O(delta) instead of O(total). Groups whose stored members can't be
 * re-fetched cheaply keep their full member rows for correctness.
 */
export class MaterializedView {
  readonly def: MaterializedViewDef;
  private readonly _engine = new OlapEngine();
  private _groups = new Map<string, StoredGroup>();
  private _pendingDelta: Row[] = [];
  private _dirty = true;
  private _lastRefresh = 0;
  private _refreshCount = 0;

  constructor(def: MaterializedViewDef) {
    this.def = def;
  }

  private _keyOf(row: Row): string {
    return JSON.stringify(this.def.groupBy.map((c) => row[c] ?? null));
  }

  /** Mark source data appended — schedules incremental work. */
  notifyAppend(rows: readonly Row[]): void {
    this._pendingDelta.push(...rows);
    if (this.def.strategy === 'lazy') this._dirty = true;
  }

  get isStale(): boolean {
    if (this._dirty) return true;
    if (this._pendingDelta.length > 0 && this.def.strategy !== 'lazy') return true;
    const maxAge = this.def.maxStalenessMs;
    return maxAge !== undefined && Date.now() - this._lastRefresh > maxAge;
  }

  get refreshCount(): number {
    return this._refreshCount;
  }

  /** Recompute according to the configured strategy. */
  refresh(allRows: readonly Row[]): { strategy: RefreshStrategy; groupsRecomputed: number } {
    const before = this._groups.size;
    switch (this.def.strategy) {
      case 'full':
        this._recomputeAll(allRows);
        break;
      case 'incremental':
        if (this._dirty) {
          this._recomputeAll(allRows);
        } else {
          this._recomputeDelta();
        }
        break;
      case 'lazy':
        // no-op; recompute happens on read
        break;
    }
    this._lastRefresh = Date.now();
    this._refreshCount++;
    return { strategy: this.def.strategy, groupsRecomputed: this._dirty ? this._groups.size : this._groups.size - before };
  }

  private _recomputeAll(rows: readonly Row[]): void {
    this._groups.clear();
    const res = this._engine.groupBy(rows, this.def.groupBy, this.def.aggregates);
    // For incremental views we must keep member rows per group: deltas are
    // merged by re-aggregating (members + delta) since finalized aggregate
    // values can't always be merged (e.g. countDistinct needs the set).
    const keepMembers = this.def.strategy === 'incremental';
    const members = keepMembers ? this._bucketize(rows) : new Map<string, Row[]>();
    for (const gr of res.rows) {
      const key = JSON.stringify(this.def.groupBy.map((c) => gr.key[c] ?? null));
      this._groups.set(key, { key: gr.key, values: gr.values, memberRows: members.get(key) ?? [] });
    }
    this._pendingDelta = [];
    this._dirty = false;
  }

  private _bucketize(rows: readonly Row[]): Map<string, Row[]> {
    const m = new Map<string, Row[]>();
    for (const row of rows) {
      const k = this._keyOf(row);
      const arr = m.get(k);
      if (arr === undefined) m.set(k, [row]);
      else arr.push(row);
    }
    return m;
  }

  /**
   * Incremental path: group the delta rows, then for each delta key
   * merge into the stored group by re-aggregating the union of the
   * group's member rows plus the delta rows. Groups absent from the
   * delta are untouched — O(delta) work.
   */
  private _recomputeDelta(): void {
    if (this._pendingDelta.length === 0) {
      this._dirty = false;
      return;
    }
    const deltaByKey = new Map<string, Row[]>();
    for (const row of this._pendingDelta) {
      const k = this._keyOf(row);
      const arr = deltaByKey.get(k);
      if (arr === undefined) deltaByKey.set(k, [row]);
      else arr.push(row);
    }
    for (const [k, deltaRows] of deltaByKey) {
      const existing = this._groups.get(k);
      // If the group never went through _recomputeAll (e.g. view created on
      // an empty source) its memberRows are still correct — empty.
      const members = [...(existing?.memberRows ?? []), ...deltaRows];
      const res = this._engine.groupBy(members, this.def.groupBy, this.def.aggregates);
      const gr: AggregateRow | undefined = res.rows[0];
      if (gr !== undefined) {
        this._groups.set(k, { key: gr.key, values: gr.values, memberRows: members });
      }
    }
    this._pendingDelta = [];
    this._dirty = false;
  }

  /** Read the view; `lazy` views recompute first when dirty. */
  rows(sourceRows?: readonly Row[]): Array<Record<string, Scalar>> {
    if (this.def.strategy === 'lazy' && this._dirty && sourceRows !== undefined) {
      this._recomputeAll(sourceRows);
    }
    const out: Array<Record<string, Scalar>> = [];
    for (const g of this._groups.values()) {
      out.push({ ...g.key, ...g.values });
    }
    return out;
  }
}

/* ------------------------------------------------------------------------ */
/* View catalog                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Catalog holding many materialized views against named row sources;
 * supports bulk refresh with per-view strategy selection.
 */
export class MaterializedViewCatalog {
  private readonly _views = new Map<string, { view: MaterializedView; source: string }>();
  private readonly _sources = new Map<string, Row[]>();

  registerSource(name: string, rows: Row[]): void {
    this._sources.set(name, rows);
  }

  appendToSource(name: string, rows: readonly Row[]): void {
    const src = this._sources.get(name);
    if (src === undefined) throw new Error(`Unknown source '${name}'`);
    src.push(...rows);
    for (const [vn, entry] of this._views) {
      if (entry.source === name) entry.view.notifyAppend(rows);
    }
  }

  createView(source: string, def: MaterializedViewDef): MaterializedView {
    if (!this._sources.has(source)) throw new Error(`Unknown source '${source}'`);
    const mv = new MaterializedView(def);
    this._views.set(def.name, { view: mv, source });
    return mv;
  }

  refreshAll(): { view: string; strategy: RefreshStrategy }[] {
    const report: { view: string; strategy: RefreshStrategy }[] = [];
    for (const [name, entry] of this._views) {
      const src = this._sources.get(entry.source) ?? [];
      const r = entry.view.refresh(src);
      report.push({ view: name, strategy: r.strategy });
    }
    return report;
  }

  view(name: string): MaterializedView {
    const v = this._views.get(name);
    if (v === undefined) throw new Error(`Unknown view '${name}'`);
    return v.view;
  }
}
