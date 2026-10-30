/**
 * Workflow Engine — Per-Step Duration Metrics
 *
 * Collects step-level timing across workflow instances and reports
 * percentiles per node — "p99 for the credit-check step is 4.2s":
 *
 *  - `recordStep(instanceId, nodeId, durationMs, { status })` — append a
 *    duration sample for a node. Optionally attach the run status so
 *    retries/escalations/failures can be split out.
 *  - `recordInstance(instanceId, workflowId, version, durationMs)` —
 *    whole-run durations for end-to-end percentiles.
 *  - `stepStats(nodeId)` — count, mean, min/max, p50/p90/p95/p99 over the
 *    recorded samples for that node. Percentiles use nearest-rank over a
 *    bounded reservoir (default 4096 samples — plenty for percentile
 *    accuracy without unbounded memory; oldest samples evict).
 *  - `bottlenecks(n)` — nodes ranked by p99, the optimization shortlist.
 *  - `versionCompare(workflowId)` — per-version mean duration of whole
 *    instances, answering "is v2 faster than v1?"
 *
 * @module WorkflowEngine/Engine2
 */

export interface StepSample {
  readonly instanceId: string;
  readonly nodeId: string;
  readonly durationMs: number;
  readonly status?: 'completed' | 'failed' | 'escalated' | 'skipped';
  readonly at: number;
}

export interface StepStats {
  readonly nodeId: string;
  readonly samples: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  /** Fraction of samples with a given status. */
  readonly statusBreakdown: Readonly<Record<string, number>>;
}

export interface InstanceStats {
  readonly workflowId: string;
  readonly version: string;
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p99Ms: number;
}

const DEFAULT_RESERVOIR = 4096;

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

export class WorkflowMetricsCollector {
  private readonly _clock: () => number;
  private readonly _reservoir: number;
  /** nodeId → samples */
  private readonly _steps = new Map<string, StepSample[]>();
  /** `workflowId@version` → durations */
  private readonly _instances = new Map<string, number[]>();

  constructor(options: { clock?: () => number; reservoir?: number } = {}) {
    this._clock = options.clock ?? Date.now;
    this._reservoir = options.reservoir ?? DEFAULT_RESERVOIR;
  }

  /** Record one step execution. */
  recordStep(
    instanceId: string,
    nodeId: string,
    durationMs: number,
    options: { status?: StepSample['status']; at?: number } = {}
  ): void {
    let samples = this._steps.get(nodeId);
    if (!samples) {
      samples = [];
      this._steps.set(nodeId, samples);
    }
    samples.push({
      instanceId,
      nodeId,
      durationMs,
      status: options.status,
      at: options.at ?? this._clock(),
    });
    if (samples.length > this._reservoir) {
      samples.splice(0, samples.length - this._reservoir);
    }
  }

  /** Record a whole-instance duration. */
  recordInstance(instanceId: string, workflowId: string, version: string, durationMs: number): void {
    const key = `${workflowId}@${version}`;
    let samples = this._instances.get(key);
    if (!samples) {
      samples = [];
      this._instances.set(key, samples);
    }
    samples.push(durationMs);
    if (samples.length > this._reservoir) {
      samples.splice(0, samples.length - this._reservoir);
    }
    void instanceId;
  }

  /** Percentile stats for one node. */
  stepStats(nodeId: string): StepStats | undefined {
    const samples = this._steps.get(nodeId);
    if (!samples || samples.length === 0) return undefined;
    const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const statusCounts: Record<string, number> = {};
    for (const s of samples) {
      const k = s.status ?? 'unknown';
      statusCounts[k] = (statusCounts[k] ?? 0) + 1;
    }
    const breakdown: Record<string, number> = {};
    for (const [k, c] of Object.entries(statusCounts)) {
      breakdown[k] = c / samples.length;
    }
    const total = durations.reduce((a, b) => a + b, 0);
    return {
      nodeId,
      samples: samples.length,
      meanMs: total / durations.length,
      minMs: durations[0],
      maxMs: durations[durations.length - 1],
      p50Ms: percentile(durations, 0.5),
      p90Ms: percentile(durations, 0.9),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      statusBreakdown: breakdown,
    };
  }

  /** All nodes ranked by p99 — the bottleneck shortlist. */
  bottlenecks(n = 10): ReadonlyArray<StepStats> {
    return [...this._steps.keys()]
      .map((id) => this.stepStats(id)!)
      .sort((a, b) => b.p99Ms - a.p99Ms)
      .slice(0, n);
  }

  /** Whole-instance stats per version of a workflow. */
  versionCompare(workflowId: string): ReadonlyArray<InstanceStats> {
    const out: InstanceStats[] = [];
    for (const [key, durations] of this._instances) {
      if (!key.startsWith(`${workflowId}@`)) continue;
      const sorted = [...durations].sort((a, b) => a - b);
      const total = sorted.reduce((a, b) => a + b, 0);
      out.push({
        workflowId,
        version: key.slice(workflowId.length + 1),
        samples: sorted.length,
        meanMs: sorted.length === 0 ? 0 : total / sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p99Ms: percentile(sorted, 0.99),
      });
    }
    return out.sort((a, b) => a.version.localeCompare(b.version));
  }

  /** Raw samples for a node (bounded). */
  samples(nodeId: string): ReadonlyArray<StepSample> {
    return this._steps.get(nodeId) ?? [];
  }

  reset(): void {
    this._steps.clear();
    this._instances.clear();
  }
}
