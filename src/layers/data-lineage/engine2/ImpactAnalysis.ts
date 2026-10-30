/**
 * Impact Analysis Engine — "what breaks if X changes?"
 *
 * The base `LineageGraph.impact()` returns a flat reachable set. This
 * engine produces the report an engineer actually needs before touching
 * a dataset:
 *
 *   - **Severity ring**: how many hops away each affected node is —
 *     ring-1 (direct consumers) pages; ring-3+ is watchlist.
 *   - **Blast-radius breadth**: which *kinds* of assets break — tables,
 *     reports, ML features — and how many of each.
 *   - **Criticality weighting**: nodes tagged `criticality=high|medium|low`
 *     in metadata sort first; a pipeline that feeds a tier-0 dashboard
 *     is a different conversation than one feeding a sandbox table.
 *   - **Bounded traversal**: `maxDepth` stops BFS early — the answer
 *     to "what breaks within 2 hops?" is much cheaper than the full
 *     transitive closure on dense graphs.
 *   - **Per-hop path materialisation**: for the top-N impacted nodes,
 *     the shortest propagation path is returned so reviewers can see
 *     *how* the break propagates.
 *
 * Complexity: O(V + E) for the bounded BFS, plus O(topN × pathLength)
 * for path reconstruction.
 *
 * @module DataLineage/Engine2
 */

import {
  LineageEdge,
  LineageGraph,
  LineageNode,
  LineageNodeKind,
  NodeId,
} from '../engine/LineageGraphEngine';

/** Severity ring = BFS distance from the changed node. */
export interface ImpactRing {
  readonly depth: number;
  readonly nodes: readonly LineageNode[];
}

/** Criticality tier from node metadata. */
export enum Criticality {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  UNSPECIFIED = 'unspecified',
}

function criticalityOf(n: LineageNode): Criticality {
  const v = n.metadata['criticality'];
  switch (v) {
    case 'high':
      return Criticality.HIGH;
    case 'medium':
      return Criticality.MEDIUM;
    case 'low':
      return Criticality.LOW;
    default:
      return Criticality.UNSPECIFIED;
  }
}

const CRIT_WEIGHT: Readonly<Record<Criticality, number>> = {
  [Criticality.HIGH]: 3,
  [Criticality.MEDIUM]: 2,
  [Criticality.LOW]: 1,
  [Criticality.UNSPECIFIED]: 1,
};

/** One impacted node with full context. */
export interface ImpactedNode {
  readonly node: LineageNode;
  readonly depth: number;
  readonly criticality: Criticality;
  /** Weighted score = critWeight / depth — shallow+critical ranks first. */
  readonly score: number;
  /** Shortest path from root to this node (node ids). */
  readonly path: readonly NodeId[];
}

/** Breakdown by node kind. */
export interface KindBreakdown {
  readonly kind: LineageNodeKind;
  readonly count: number;
  readonly nodeIds: readonly NodeId[];
}

/** Full impact report. */
export interface ImpactReport2 {
  readonly root: NodeId;
  readonly maxDepth: number;
  readonly totalAffected: number;
  readonly rings: readonly ImpactRing[];
  readonly byKind: readonly KindBreakdown[];
  /** Nodes sorted by (score desc, depth asc) — the "fix first" list. */
  readonly ranked: readonly ImpactedNode[];
  /** Criticality counts for the summary line. */
  readonly criticalityCounts: Readonly<Record<Criticality, number>>;
  /** Top-N paths for the narrative report. */
  readonly notablePaths: readonly (readonly NodeId[])[];
}

/** Analyzer config. */
export interface ImpactConfig {
  /** Max BFS depth. Default unlimited. */
  readonly maxDepth?: number;
  /** Edge kinds traversed; default all lineage edges. */
  readonly edgeKinds?: readonly LineageEdge['kind'][];
  /** Number of ranked nodes returned. Default 50. */
  readonly topN: number;
  /** Paths materialised for the report. Default 10. */
  readonly notablePathCount: number;
}

const DEFAULT_IMPACT_CONFIG: ImpactConfig = {
  maxDepth: undefined,
  edgeKinds: undefined,
  topN: 50,
  notablePathCount: 10,
};

/**
 * ImpactAnalyzer — bounded, ranked, path-aware blast-radius.
 */
export class ImpactAnalyzer {
  private readonly _g: LineageGraph;
  private readonly _config: ImpactConfig;

  constructor(graph: LineageGraph, config: Partial<ImpactConfig> = {}) {
    this._g = graph;
    this._config = { ...DEFAULT_IMPACT_CONFIG, ...config };
  }

  /**
   * Compute the downstream impact report for `rootId`.
   */
  analyze(rootId: NodeId): ImpactReport2 {
    const cfg = this._config;
    const depth = new Map<NodeId, number>([[rootId, 0]]);
    const parent = new Map<NodeId, NodeId>();
    const queue: NodeId[] = [rootId];
    const maxD = cfg.maxDepth ?? Number.POSITIVE_INFINITY;

    while (queue.length > 0) {
      const cur = queue.shift() as NodeId;
      const d = depth.get(cur) as number;
      if (d >= maxD) continue;
      for (const e of this._g.outEdges(cur)) {
        if (cfg.edgeKinds !== undefined && !cfg.edgeKinds.includes(e.kind)) continue;
        const next = e.to;
        if (!depth.has(next)) {
          depth.set(next, d + 1);
          parent.set(next, cur);
          queue.push(next);
        }
      }
    }

    // Group into rings + collect ranked nodes.
    const rings = new Map<number, LineageNode[]>();
    const ranked: ImpactedNode[] = [];
    const critCounts: Record<Criticality, number> = {
      [Criticality.HIGH]: 0,
      [Criticality.MEDIUM]: 0,
      [Criticality.LOW]: 0,
      [Criticality.UNSPECIFIED]: 0,
    };
    const kindGroups = new Map<LineageNodeKind, NodeId[]>();

    for (const [id, d] of depth) {
      if (id === rootId) continue;
      const node = this._g.node(id);
      if (node === undefined) continue;
      let ring = rings.get(d);
      if (ring === undefined) {
        ring = [];
        rings.set(d, ring);
      }
      ring.push(node);
      const crit = criticalityOf(node);
      critCounts[crit]++;
      const score = CRIT_WEIGHT[crit] / d;
      const path = this._pathTo(rootId, id, parent);
      ranked.push({ node, depth: d, criticality: crit, score, path });
      let kg = kindGroups.get(node.kind);
      if (kg === undefined) {
        kg = [];
        kindGroups.set(node.kind, kg);
      }
      kg.push(id);
    }

    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        a.depth - b.depth ||
        (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0)
    );
    const topRanked = ranked.slice(0, cfg.topN);
    const notable: readonly (readonly NodeId[])[] = topRanked
      .slice(0, cfg.notablePathCount)
      .map((r) => [...r.path]);

    const ringArr: ImpactRing[] = [...rings.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, nodes]) => ({ depth, nodes }));
    const byKind: KindBreakdown[] = [...kindGroups.entries()].map(([kind, nodeIds]) => ({
      kind,
      count: nodeIds.length,
      nodeIds,
    }));

    return {
      root: rootId,
      maxDepth: cfg.maxDepth ?? 0,
      totalAffected: ranked.length,
      rings: ringArr,
      byKind,
      ranked: topRanked,
      criticalityCounts: critCounts,
      notablePaths: notable,
    };
  }

  /**
   * Shortest propagation path root → target via parent pointers.
   */
  private _pathTo(root: NodeId, target: NodeId, parent: ReadonlyMap<NodeId, NodeId>): NodeId[] {
    const path: NodeId[] = [target];
    let cur = target;
    while (cur !== root) {
      const p = parent.get(cur);
      if (p === undefined) break;
      path.unshift(p);
      cur = p;
    }
    return path;
  }

  /**
   * Human-readable narrative — the text a change-request template
   * would embed.
   */
  narrative(report: ImpactReport2): string {
    const parts: string[] = [
      `Impact of ${report.root}: ${report.totalAffected} node(s) affected` +
        (report.maxDepth > 0 ? ` within ${report.maxDepth} hop(s)` : ''),
    ];
    const c = report.criticalityCounts;
    parts.push(
      `criticality: high=${c[Criticality.HIGH]} medium=${c[Criticality.MEDIUM]} ` +
        `low=${c[Criticality.LOW]}`
    );
    for (const r of report.rings.slice(0, 3)) {
      parts.push(`ring-${r.depth}: ${r.nodes.length} node(s)`);
    }
    if (report.notablePaths.length > 0) {
      parts.push('notable paths:');
      for (const p of report.notablePaths.slice(0, 5)) {
        parts.push(`  ${p.join(' → ')}`);
      }
    }
    return parts.join('\n');
  }
}
