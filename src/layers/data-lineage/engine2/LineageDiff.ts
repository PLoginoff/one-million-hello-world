/**
 * Lineage Diff — semantic comparison of two graph versions
 *
 * `LineageStore.diff` computes structural set differences (added/
 * removed nodes & edges). This module adds the *semantic* layer on
 * top — the review-time question "what does this diff mean?":
 *
 *   - **Affected pipelines**: which jobs lost/gained edges — the
 *     "pipeline touched" summary reviewers care about more than raw
 *     edge counts.
 *   - **Broken chains**: datasets whose upstream disappeared entirely
 *     (would-be orphans) vs. datasets newly connected.
 *   - **Rewired edges**: edges that changed *kind* between versions —
 *     a `reads`→`derives` flip on the same (from,to) is a semantic
 *     change, not just an add+remove.
 *   - **Impact overlap**: which of the removed edges lie on paths to
 *     nodes still in the graph — i.e. which removals actively break
 *     existing pipelines vs. prunes dead code.
 *
 * Complexity: O(#nodes + #edges) for the set comparisons; broken-chain
 * detection adds a reachability pass per removed edge.
 *
 * @module DataLineage/Engine2
 */

import { LineageEdge, LineageEdgeKind, LineageGraph, LineageNode, NodeId } from '../engine/LineageGraphEngine';

function edgeKey(e: { from: NodeId; to: NodeId }): string {
  return `${e.from}→${e.to}`;
}

function fullKey(e: { from: NodeId; to: NodeId; kind: LineageEdgeKind }): string {
  return `${e.from}→${e.to}#${e.kind}`;
}

/** A (from,to) pair whose edge kind changed between versions. */
export interface RewiredEdge {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly oldKind: LineageEdgeKind;
  readonly newKind: LineageEdgeKind;
}

/** A dataset whose lineage changed semantically. */
export interface AffectedPipeline {
  readonly datasetId: NodeId;
  /** Edges added or removed touching this dataset. */
  readonly addedEdges: readonly LineageEdge[];
  readonly removedEdges: readonly LineageEdge[];
  /** True when the dataset lost ALL its upstream producers. */
  readonly orphaned: boolean;
  /** True when the dataset lost ALL downstream consumers. */
  readonly unlinked: boolean;
}

/** Semantic diff report. */
export interface SemanticDiff {
  readonly addedNodes: readonly LineageNode[];
  readonly removedNodes: readonly NodeId[];
  readonly addedEdges: readonly LineageEdge[];
  readonly removedEdges: readonly LineageEdge[];
  readonly rewired: readonly RewiredEdge[];
  readonly affectedPipelines: readonly AffectedPipeline[];
  /**
   * Removed edges that still sit on a path to surviving nodes —
   * "breaking changes" that alter reachable lineage.
   */
  readonly breakingEdges: readonly LineageEdge[];
  readonly summary: string;
}

/**
 * LineageDiffer — semantic comparison over two graph snapshots.
 */
export class LineageDiffer {
  /**
   * Compute the semantic diff between two graphs (older → newer).
   * Accepts any pair of `LineageGraph` instances — typically the
   * snapshots from `LineageStore.snapshot(v)` at two versions.
   */
  diff(oldGraph: LineageGraph, newGraph: LineageGraph): SemanticDiff {
    // --- node sets -------------------------------------------------------
    const oldNodes = new Map<NodeId, LineageNode>();
    for (const n of oldGraph.toJSON().nodes) oldNodes.set(n.id, n);
    const newNodes = new Map<NodeId, LineageNode>();
    for (const n of newGraph.toJSON().nodes) newNodes.set(n.id, n);
    const addedNodes = [...newNodes.values()].filter((n) => !oldNodes.has(n.id));
    const removedNodes = [...oldNodes.keys()].filter((id) => !newNodes.has(id));

    // --- edge sets ---------------------------------------------------------
    const oldEdges = oldGraph.edges();
    const newEdges = newGraph.edges();
    const oldFull = new Set(oldEdges.map(fullKey));
    const newFull = new Set(newEdges.map(fullKey));
    const addedEdges = newEdges.filter((e) => !oldFull.has(fullKey(e)));
    const removedEdges = oldEdges.filter((e) => !newFull.has(fullKey(e)));

    // --- rewired: same (from,to), different kind ----------------------------
    const oldByPair = new Map<string, LineageEdge[]>();
    for (const e of oldEdges) {
      const k = edgeKey(e);
      let arr = oldByPair.get(k);
      if (arr === undefined) {
        arr = [];
        oldByPair.set(k, arr);
      }
      arr.push(e);
    }
    const rewired: RewiredEdge[] = [];
    for (const e of newEdges) {
      const arr = oldByPair.get(edgeKey(e));
      if (arr !== undefined && arr.length > 0 && !arr.some((o) => o.kind === e.kind)) {
        for (const o of arr) rewired.push({ from: e.from, to: e.to, oldKind: o.kind, newKind: e.kind });
      }
    }

    // --- affected pipelines ------------------------------------------------
    const perDataset = new Map<NodeId, AffectedPipeline & { _add: LineageEdge[]; _rem: LineageEdge[] }>();
    const touch = (ds: NodeId, added: LineageEdge | null, removed: LineageEdge | null) => {
      let p = perDataset.get(ds);
      if (p === undefined) {
        p = { datasetId: ds, addedEdges: [], removedEdges: [], orphaned: false, unlinked: false, _add: [], _rem: [] };
        perDataset.set(ds, p);
      }
      if (added !== null) p._add.push(added);
      if (removed !== null) p._rem.push(removed);
    };
    for (const e of addedEdges) {
      touch(e.from, e, null);
      touch(e.to, e, null);
    }
    for (const e of removedEdges) {
      touch(e.from, null, e);
      touch(e.to, null, e);
    }
    const affected: AffectedPipeline[] = [];
    for (const [id, p] of perDataset) {
      // Orphan = lost all upstream producers in the NEW graph.
      const upstream = newGraph.inEdges(id).filter((e) => e.kind === 'writes' || e.kind === 'derives' || e.kind === 'reads');
      const downstream = newGraph.outEdges(id).filter((e) => e.kind === 'writes' || e.kind === 'derives' || e.kind === 'reads');
      affected.push({
        datasetId: id,
        addedEdges: p._add,
        removedEdges: p._rem,
        orphaned: p._rem.length > 0 && upstream.length === 0,
        unlinked: p._rem.length > 0 && downstream.length === 0,
      });
    }

    // --- breaking edges ------------------------------------------------------
    // A removed edge is "breaking" if in the OLD graph it still lay on a
    // path to a node that survives in the NEW graph — i.e. its removal
    // changes reachable lineage, not just prunes dead ends.
    const breaking: LineageEdge[] = [];
    const newNodeSet = new Set(newNodes.keys());
    for (const e of removedEdges) {
      if (!newNodeSet.has(e.from) || !newNodeSet.has(e.to)) continue;
      // Does removing this edge disconnect e.to's downstream in the new
      // graph? Approximation: e.to is still reachable in newGraph, so the
      // edge fed a live node — flag it.
      if (newGraph.inEdges(e.to).length > 0 || newGraph.outEdges(e.to).length > 0) {
        breaking.push(e);
      }
    }

    const summary =
      `+${addedNodes.length} nodes -${removedNodes.length} nodes, ` +
      `+${addedEdges.length} edges -${removedEdges.length} edges, ` +
      `${rewired.length} rewired, ${breaking.length} breaking`;

    return {
      addedNodes,
      removedNodes,
      addedEdges,
      removedEdges,
      rewired,
      affectedPipelines: affected,
      breakingEdges: breaking,
      summary,
    };
  }
}
