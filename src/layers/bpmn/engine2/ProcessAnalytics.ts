/**
 * Process Analytics — bottleneck detection.
 *
 * Consumes per-node timing records (entered/exited timestamps) and
 * answers "which step takes longest across all instances?". Timings
 * are recorded externally (e.g. a TraceListener that diffs entry
 * timestamps) and fed to {@link record} — the analyser stays agnostic
 * of how the engine produced them.
 *
 * Aggregation is a running per-node accumulator — O(1) per record,
 * O(N) per report where N = distinct nodes. Per-node we track count,
 * total, min, max; the report derives mean and the share-of-total
 * used to flag the dominant bottleneck.
 *
 * Bottleneck = the node with the greatest TOTAL elapsed time across
 * all instances (the highest-impact optimisation target), not the
 * slowest single execution — a rare slow step matters less than a
 * moderately-slow one hit on every run.
 *
 * @module BpmnLayer/Engine2
 */

import { BottleneckReport, NodeStats, NodeTiming } from './types';

interface Accumulator {
  nodeId: string;
  executions: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
}

export class ProcessAnalytics {
  /** definitionId -> nodeId -> accumulator. */
  private readonly _byDef: Map<string, Map<string, Accumulator>>;

  constructor() {
    this._byDef = new Map();
  }

  /** Record one node execution for `definitionId`. */
  record(definitionId: string, timing: NodeTiming): void {
    const dur = timing.exitedAt - timing.enteredAt;
    let perNode = this._byDef.get(definitionId);
    if (!perNode) {
      perNode = new Map();
      this._byDef.set(definitionId, perNode);
    }
    let acc = perNode.get(timing.nodeId);
    if (!acc) {
      acc = { nodeId: timing.nodeId, executions: 0, totalMs: 0, maxMs: -Infinity, minMs: Infinity };
      perNode.set(timing.nodeId, acc);
    }
    acc.executions += 1;
    acc.totalMs += dur;
    if (dur > acc.maxMs) acc.maxMs = dur;
    if (dur < acc.minMs) acc.minMs = dur;
  }

  /** Bulk-record a whole instance's timings. */
  recordInstance(definitionId: string, timings: readonly NodeTiming[]): void {
    for (const t of timings) this.record(definitionId, t);
  }

  /**
   * Bottleneck report: nodes ranked by total time descending, with the
   * dominant node surfaced separately. Empty when nothing recorded.
   */
  analyze(definitionId: string): BottleneckReport {
    const perNode = this._byDef.get(definitionId);
    if (!perNode || perNode.size === 0) {
      return { definitionId, ranked: [], bottleneck: null, totalMs: 0 };
    }
    const total = Array.from(perNode.values()).reduce((s, a) => s + a.totalMs, 0);
    const ranked: NodeStats[] = Array.from(perNode.values())
      .map((a) => ({
        nodeId: a.nodeId,
        executions: a.executions,
        totalMs: a.totalMs,
        meanMs: a.executions > 0 ? a.totalMs / a.executions : 0,
        maxMs: a.maxMs,
        minMs: a.minMs,
        shareOfTotal: total > 0 ? a.totalMs / total : 0,
      }))
      .sort((a, b) => b.totalMs - a.totalMs);
    return { definitionId, ranked, bottleneck: ranked[0] ?? null, totalMs: total };
  }

  /** Mean duration of a specific node, or null when no data. */
  meanFor(definitionId: string, nodeId: string): number | null {
    const acc = this._byDef.get(definitionId)?.get(nodeId);
    return acc && acc.executions > 0 ? acc.totalMs / acc.executions : null;
  }

  /** True when a node's mean exceeds `thresholdMs` — alerting helper. */
  isBottleneck(definitionId: string, nodeId: string, thresholdMs: number): boolean {
    const m = this.meanFor(definitionId, nodeId);
    return m !== null && m > thresholdMs;
  }

  /** Reset all recorded data. */
  reset(): void {
    this._byDef.clear();
  }
}
