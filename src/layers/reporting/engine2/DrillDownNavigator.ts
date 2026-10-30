/**
 * Reporting Engine2 — Drill-Down Navigation
 *
 * Dashboards need "click the row, see the breakdown". This module models
 * drill-down as a tree of report nodes: each node is a query specialization
 * derived from its parent by injecting filter predicates.
 *
 *   sales-by-region ──click 'EU'──▶ sales-by-country[region=EU]
 *                                  └─click 'DE'──▶ sales-by-city[region=EU,country=DE]
 *
 * Semantics:
 *   - A `DrillNode` declares its drill dimensions; `drill(row)` matches the
 *     clicked row's key columns against the current node's group-by and
 *     produces a child spec with additive filters.
 *   - Navigation is a STACK: `up()` pops to the parent; `crumbs()` renders
 *     the path for breadcrumb UI; `reset()` returns to the root.
 *   - Filters accumulate: child filters = parent filters + row equality
 *     on the drilled dimension. No filter is ever dropped by drilling —
 *     up() restores the earlier query by construction.
 *   - `resolve(node)` hands the composed ReportQuery back to the caller
 *     to execute through QueryPipeline — we stay I/O-free.
 *
 * Complexity: drill O(filters); the tree is in-memory and shallow by
 * design (depth ≤ number of declared dimensions).
 *
 * @module ReportingLayer/Engine2
 */

import { Cell, Filter, ReportQuery, Row } from '../reports/ReportTypes';

/** One node in a drill hierarchy. */
export interface DrillSpec {
  readonly name: string;
  readonly query: ReportQuery;
  /**
   * Ordered drill dimensions: each is a column a user may click to
   * descend one level. The i-th click on dimension d adds `d = row[d]`
   * to the filters and moves the group-by to the NEXT dimension.
   */
  readonly drillPath: readonly string[];
}

export interface DrillNode {
  readonly spec: DrillSpec;
  /** Depth in the navigation stack (root = 0). */
  readonly depth: number;
  /** Dimension drilled to reach this node (null at root). */
  readonly drilledOn: string | null;
  /** Cell value filtered on (null at root). */
  readonly drilledValue: Cell | null;
  readonly parent: DrillNode | null;
  readonly children: DrillNode[];
}

export interface Crumb {
  readonly label: string;
  readonly depth: number;
}

/**
 * Stateful navigation session over a drill spec. Not shared across
 * users — each viewer gets a stack.
 */
export class DrillNavigator {
  private _current: DrillNode;

  constructor(root: DrillSpec) {
    this._current = {
      spec: root,
      depth: 0,
      drilledOn: null,
      drilledValue: null,
      parent: null,
      children: [],
    };
    if (root.drillPath.length === 0) {
      throw new Error('drill spec needs ≥1 drill dimension');
    }
  }

  get current(): DrillNode {
    return this._current;
  }

  /** The query to run for the current node. */
  query(): ReportQuery {
    return this._current.spec.query;
  }

  /** Dimension the NEXT drill will apply (null at the leaf). */
  nextDimension(): string | null {
    const { spec, depth } = this._current;
    return depth < spec.drillPath.length ? spec.drillPath[depth] : null;
  }

  /**
   * Drill into `row` on the next dimension. The row must contain that
   * dimension's column — it was a group-by key in the result set.
   * Returns the new current node, or null when already at the leaf.
   */
  drill(row: Row): DrillNode | null {
    const dim = this.nextDimension();
    if (dim === null) return null;
    const value = row[dim];
    if (value === undefined) {
      throw new Error(`row lacks drill column '${dim}'`);
    }
    const childQuery = composeQuery(this._current.spec.query, dim, value, this._current.depth, this._current.spec.drillPath);
    const node: DrillNode = {
      spec: { ...this._current.spec, query: childQuery },
      depth: this._current.depth + 1,
      drilledOn: dim,
      drilledValue: value,
      parent: this._current,
      children: [],
    };
    this._current.children.push(node);
    this._current = node;
    return node;
  }

  /** Ascend one level; false at root. */
  up(): boolean {
    if (!this._current.parent) return false;
    this._current = this._current.parent;
    return true;
  }

  /** Ascend to an absolute depth (0 = root). */
  toDepth(depth: number): boolean {
    while (this._current.depth > depth) {
      if (!this.up()) return false;
    }
    return this._current.depth === depth;
  }

  reset(): void {
    this.toDepth(0);
  }

  /** Breadcrumb trail root→current for UI rendering. */
  crumbs(): Crumb[] {
    const out: Crumb[] = [];
    let n: DrillNode | null = this._current;
    while (n) {
      out.push({
        label: n.drilledOn === null ? n.spec.name : `${n.drilledOn}=${String(n.drilledValue)}`,
        depth: n.depth,
      });
      n = n.parent;
    }
    return out.reverse();
  }
}

/**
 * Child query composition: parent filters + `dim = value`; group-by slides
 * to the next drill dimension (or stays on the last at leaf depth).
 */
function composeQuery(
  parent: ReportQuery,
  dim: string,
  value: Cell,
  depth: number,
  drillPath: readonly string[]
): ReportQuery {
  const filters: Filter[] = [...(parent.filters ?? []), { column: dim, op: 'eq', value }];
  const nextDim = depth + 1 < drillPath.length ? drillPath[depth + 1] : dim;
  return {
    ...parent,
    filters,
    groupBy: [nextDim],
  };
}
