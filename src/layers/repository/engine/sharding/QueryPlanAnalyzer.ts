/**
 * QueryPlanAnalyzer — static cost estimation + plan diagnostics.
 *
 * Before a query runs, a real database builds an execution plan: which
 * indexes to use, how many rows each step is expected to touch, whether a
 * sort needs an index or a spill. This analyzer does the same job over a
 * `SpecNode` tree + declared indexes + table statistics:
 *
 *   - Walks the spec, extracting per-field selectivity estimates
 *     (equality ≈ 1/cardinality, ranges ≈ 25% heuristic — the same
 *     "magic constants" Postgres uses when it lacks statistics).
 *   - Chooses the cheapest access path: an `eq` on an indexed field →
 *     index-lookup; an indexed field anywhere in the conjuncts → index-scan;
 *     otherwise → full-scan.
 *   - Emits diagnostics: FULL_SCAN_LARGE_TABLE when a scan touches more
 *     than `largeTableRows` rows, MISSING_INDEX when a highly selective
 *     filter has no index, SORT_NO_INDEX when the sort key isn't indexed.
 *   - `pruneShards` finds single-shard specs: an `eq`/`in` on the shard key
 *     pins the query to specific shards so the fan-out executor can skip
 *     the rest (the biggest sharding optimization — a scatter query is
 *     S× slower than a routed one).
 *
 * @module RepositoryLayer/Engine/Sharding
 */

import { SpecNode, SortKey } from '../types';
import { PlanDiagnostic, PlanNode, PlanReport } from './types';

export interface TableStats {
  /** Total rows in the table (across all shards if sharded). */
  readonly rowCount: number;
  /** field → approximate distinct values (for selectivity). */
  readonly cardinality?: Readonly<Record<string, number>>;
}

export interface AnalyzerOptions {
  /** Rows above which a full scan is flagged as critical. Default 10000. */
  readonly largeTableRows?: number;
  /** Selectivity below which a missing index is flagged. Default 0.05. */
  readonly selectiveThreshold?: number;
}

export class QueryPlanAnalyzer {
  private readonly largeTableRows: number;
  private readonly selectiveThreshold: number;

  constructor(options: AnalyzerOptions = {}) {
    this.largeTableRows = options.largeTableRows ?? 10_000;
    this.selectiveThreshold = options.selectiveThreshold ?? 0.05;
  }

  /**
   * Builds an estimated plan for `spec` + `sort` over a table with
   * `indexedFields` and `stats`.
   */
  analyze(
    spec: SpecNode,
    sort: readonly SortKey[],
    indexedFields: readonly string[],
    stats: TableStats
  ): PlanReport {
    const diagnostics: PlanDiagnostic[] = [];
    const total = Math.max(1, stats.rowCount);
    const selectivity = this.estimateSelectivity(spec, stats);
    const estRows = Math.max(0, Math.round(total * selectivity));
    const indexField = this.pickIndexField(spec, indexedFields);

    let access: PlanNode;
    if (spec.kind === 'cmp' && spec.op === 'eq' && indexedFields.includes(spec.field)) {
      access = {
        kind: 'index-lookup',
        detail: `INDEX ${spec.field} = $1`,
        estRows,
        estCost: estRows + 1,
        children: [],
      };
      diagnostics.push({
        severity: 'info',
        code: 'SELECTIVE_INDEX_OK',
        message: `Equality on indexed "${spec.field}" → O(log n) lookup, ~${estRows} rows`,
      });
    } else if (indexField !== null) {
      access = {
        kind: 'index-scan',
        detail: `INDEX ${indexField} + residual filter`,
        estRows,
        // Index scan touches matching rows + a B-tree descent.
        estCost: estRows + Math.ceil(Math.log2(total)),
        children: [],
      };
      diagnostics.push({
        severity: 'info',
        code: 'SELECTIVE_INDEX_OK',
        message: `Predicate uses index "${indexField}"; residual filter drops to ~${estRows} rows`,
      });
    } else {
      access = {
        kind: 'full-scan',
        detail: `SEQ SCAN (no usable index)`,
        estRows,
        estCost: total, // every row visited
        children: [],
      };
      if (total >= this.largeTableRows) {
        diagnostics.push({
          severity: 'critical',
          code: 'FULL_SCAN_LARGE_TABLE',
          message: `Full scan over ~${total} rows (>= ${this.largeTableRows} threshold). ` +
            `Add an index on ${this.firstFilterField(spec) ?? 'the filtered field'} or accept O(n) cost.`,
        });
      } else {
        diagnostics.push({
          severity: 'info',
          code: 'SMALL_TABLE_SCAN_OK',
          message: `Full scan acceptable at ~${total} rows (< threshold).`,
        });
      }
      if (selectivity <= this.selectiveThreshold && indexField === null) {
        diagnostics.push({
          severity: 'warning',
          code: 'MISSING_INDEX',
          message:
            `Highly selective predicate (est. ${(selectivity * 100).toFixed(2)}% of rows) ` +
            `has no index — an index on "${this.firstFilterField(spec) ?? '?'}" would cut cost ~${Math.round(
              total - estRows
            )} units.`,
        });
      }
    }

    // Sort node when requested and the sort's first key isn't the access index.
    let root: PlanNode = access;
    if (sort.length > 0) {
      const sortedByIndex = indexField !== null && sort[0].field === indexField;
      root = {
        kind: 'sort',
        detail: sortedByIndex
          ? `ORDER BY ${sort[0].field} (index order, no sort step)`
          : `ORDER BY ${sort.map((s) => `${s.field} ${s.dir}`).join(', ')} (in-memory sort)`,
        estRows,
        // Sort cost ~ n log n comparisons unless the index already orders.
        estCost: access.estCost + (sortedByIndex ? 0 : Math.ceil(estRows * Math.log2(Math.max(2, estRows)))),
        children: sortedByIndex ? access.children : [access],
      };
      if (!sortedByIndex && estRows >= this.largeTableRows) {
        diagnostics.push({
          severity: 'warning',
          code: 'SORT_NO_INDEX',
          message: `Sort on "${sort[0].field}" over ~${estRows} rows has no supporting index — ` +
            `expect an O(n log n) sort step.`,
        });
      }
    }

    const criticals = diagnostics.filter((d) => d.severity === 'critical');
    return { root, diagnostics, ok: criticals.length === 0 };
  }

  /**
   * Shard pruning: returns the concrete shard keys a query can be routed to,
   * or null when the spec doesn't constrain the shard key (fan out to all).
   *
   *   eq(sharkKey, v)            → [v]
   *   in(shardKey, [v1, v2])     → [v1, v2]
   *   and(..., eq(shardKey,v))   → [v]  (pruning survives conjunction)
   *   anything else              → null (scatter required)
   */
  pruneShards(spec: SpecNode, shardKeyField: string): string[] | null {
    switch (spec.kind) {
      case 'cmp':
        if (spec.field === shardKeyField && spec.op === 'eq') {
          return [String(spec.value)];
        }
        return null;
      case 'in':
        if (spec.field === shardKeyField) {
          return spec.values.map(String);
        }
        return null;
      case 'and': {
        // Any child constraining the shard key prunes the whole conjunct.
        for (const child of spec.children) {
          const keys = this.pruneShards(child, shardKeyField);
          if (keys !== null) return keys;
        }
        return null;
      }
      case 'or': {
        // OR is prunable only if EVERY branch pins the key — union of keys.
        const parts: string[] = [];
        for (const child of spec.children) {
          const keys = this.pruneShards(child, shardKeyField);
          if (keys === null) return null;
          parts.push(...keys);
        }
        return [...new Set(parts)];
      }
      default:
        return null;
    }
  }

  /**
   * Estimates what fraction of rows `spec` matches, in [0,1].
   *
   * Heuristics mirror the constants real planners use without statistics:
   *   eq      → 1/cardinality (default 1/10 for medium-cardinality fields)
   *   ne      → 1 - eq
   *   range   → 0.25  (Postgres DEFAULT_RANGE_INEQ_SEL ~ 0.005–0.25)
   *   in(n)   → n · eq, capped at 1
   *   isNull  → 0.01  (nulls are rare)
   *   and     → product (independence assumption — same as real planners)
   *   or      → 1 - Π(1 - si) (inclusion-exclusion, approximated)
   *   not     → 1 - s
   */
  estimateSelectivity(spec: SpecNode, stats: TableStats): number {
    const card = (f: string) => Math.max(1, stats.cardinality?.[f] ?? 10);
    switch (spec.kind) {
      case 'all':
        return 1;
      case 'none':
        return 0;
      case 'cmp': {
        switch (spec.op) {
          case 'eq':
            return 1 / card(spec.field);
          case 'ne':
            return 1 - 1 / card(spec.field);
          case 'gt':
          case 'gte':
          case 'lt':
          case 'lte':
            return 0.33; // one-sided range heuristic
          case 'contains':
          case 'startsWith':
          case 'endsWith':
            return spec.op === 'startsWith' ? 0.1 : 0.05;
          default:
            return 0.5;
        }
      }
      case 'between':
        return 0.25;
      case 'in':
        return Math.min(1, spec.values.length / card(spec.field));
      case 'isNull':
        return 0.01;
      case 'notNull':
        return 0.99;
      case 'not':
        return 1 - this.estimateSelectivity(spec.child, stats);
      case 'and':
        return spec.children.reduce(
          (acc, c) => acc * this.estimateSelectivity(c, stats),
          1
        );
      case 'or': {
        // 1 - Π(1 - s_i) — exact for independent disjuncts.
        let prodNone = 1;
        for (const c of spec.children) {
          prodNone *= 1 - this.estimateSelectivity(c, stats);
        }
        return 1 - prodNone;
      }
      default: {
        const _exhaustive: never = spec;
        void _exhaustive;
        return 0.5;
      }
    }
  }

  /** Cheapest usable index: first conjunct leaf field that's indexed. */
  private pickIndexField(spec: SpecNode, indexed: readonly string[]): string | null {
    const fields = new Set<string>();
    const walk = (n: SpecNode): void => {
      switch (n.kind) {
        case 'cmp':
        case 'between':
        case 'in':
        case 'isNull':
        case 'notNull':
          fields.add(n.field);
          break;
        case 'and':
        case 'or':
          n.children.forEach(walk);
          break;
        case 'not':
          walk(n.child);
          break;
        default:
          break;
      }
    };
    walk(spec);
    for (const f of fields) {
      if (indexed.includes(f)) return f;
    }
    return null;
  }

  private firstFilterField(spec: SpecNode): string | null {
    switch (spec.kind) {
      case 'cmp':
      case 'between':
      case 'in':
        return spec.field;
      case 'and':
      case 'or':
        for (const c of spec.children) {
          const f = this.firstFilterField(c);
          if (f) return f;
        }
        return null;
      case 'not':
        return this.firstFilterField(spec.child);
      default:
        return null;
    }
  }
}
