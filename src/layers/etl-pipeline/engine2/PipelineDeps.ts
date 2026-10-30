/**
 * Pipeline Dependency Management — run-order resolution and parallel
 * stage scheduling.
 *
 * Complements `engine/DagEngine` (which executes rows through a DAG) —
 * this manages the *scheduling* dimension:
 *
 *   - `DependencyGraph`: register pipelines with `dependsOn` edges;
 *     `runOrder()` gives Kahn topological order; `layers()` groups
 *     pipelines into maximally parallel stages.
 *   - `ParallelScheduler`: executes ready pipelines in parallel bounded
 *     by `maxConcurrency`, respecting dependencies — a pipeline becomes
 *     ready when all its deps complete; failures propagate downstream
 *     as 'skipped' (deps-not-satisfied).
 *   - Critical path analysis: longest dependency chain — the floor on
 *     wall-clock even with infinite parallelism.
 *
 * @module EtlPipeline/Engine2
 */

export interface PipelineNode {
  readonly id: string;
  readonly dependsOn: readonly string[];
  /** Estimated duration (ms) — used by critical-path analysis. */
  readonly estDurationMs?: number;
}

export class DependencyGraph {
  private readonly nodes = new Map<string, PipelineNode>();

  add(node: PipelineNode): void {
    this.nodes.set(node.id, node);
    for (const d of node.dependsOn) {
      if (!this.nodes.has(d)) {
        // forward-declare placeholder for out-of-order registration
        this.nodes.set(d, { id: d, dependsOn: [] });
      }
    }
  }

  get(id: string): PipelineNode | undefined {
    return this.nodes.get(id);
  }

  ids(): readonly string[] {
    return [...this.nodes.keys()];
  }

  /** Kahn topological order; throws on cycles. O(V+E). */
  runOrder(): readonly string[] {
    const layers = this.layers();
    return layers.flat();
  }

  /**
   * Group nodes into parallel layers — layer k contains nodes whose
   * deps all live in layers < k. O(V+E).
   */
  layers(): readonly (readonly string[])[] {
    const indeg = new Map<string, number>();
    const deps = new Map<string, string[]>(); // dep → dependents
    for (const [id, n] of this.nodes) {
      indeg.set(id, n.dependsOn.length);
      for (const d of n.dependsOn) {
        if (!this.nodes.has(d)) throw new Error(`unknown dependency '${d}' of '${id}'`);
        const l = deps.get(d) ?? [];
        l.push(id);
        deps.set(d, l);
      }
    }
    let frontier = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const layers: string[][] = [];
    let resolved = 0;
    while (frontier.length > 0) {
      layers.push(frontier);
      resolved += frontier.length;
      const next: string[] = [];
      for (const id of frontier) {
        for (const dependent of deps.get(id) ?? []) {
          indeg.set(dependent, indeg.get(dependent)! - 1);
          if (indeg.get(dependent) === 0) next.push(dependent);
        }
      }
      frontier = next;
    }
    if (resolved < this.nodes.size) {
      const stuck = [...indeg.entries()].filter(([, d]) => d > 0).map(([id]) => id);
      throw new Error(`dependency cycle involving: ${stuck.join(', ')}`);
    }
    return layers;
  }

  /**
   * Critical path — longest estDuration chain. The minimum possible
   * wall-clock for the pipeline set.
   */
  criticalPathMs(): number {
    const order = this.runOrder();
    const longest = new Map<string, number>();
    for (const id of order) {
      const n = this.nodes.get(id)!;
      const depMax = Math.max(0, ...n.dependsOn.map((d) => longest.get(d) ?? 0));
      longest.set(id, depMax + (n.estDurationMs ?? 1));
    }
    return Math.max(0, ...longest.values());
  }
}

export type PipelineRunStatus = 'success' | 'failed' | 'skipped';

export interface PipelineRun {
  readonly id: string;
  readonly status: PipelineRunStatus;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly error?: string;
}

/** What each pipeline actually does. */
export type PipelineTask = (id: string) => Promise<void>;

export interface SchedulerOptions {
  readonly maxConcurrency?: number;
  /** Per-pipeline timeout; 0 = none. */
  readonly timeoutMs?: number;
}

/**
 * Executes a DependencyGraph's pipelines in parallel layers with a
 * concurrency cap. A failed pipeline skips its dependents (which run
 * only when ALL deps succeed).
 */
export class ParallelScheduler {
  private readonly maxConc: number;
  private readonly timeout: number;

  constructor(options: SchedulerOptions = {}) {
    this.maxConc = options.maxConcurrency ?? 4;
    this.timeout = options.timeoutMs ?? 0;
  }

  async run(graph: DependencyGraph, task: PipelineTask): Promise<readonly PipelineRun[]> {
    const layers = graph.layers();
    const results = new Map<string, PipelineRun>();
    const startedAll = this.clockNow();

    for (const layer of layers) {
      // Within a layer: bounded-concurrency pool.
      const queue = [...layer];
      const workers: Promise<void>[] = [];
      const worker = async () => {
        while (queue.length > 0) {
          const id = queue.shift()!;
          // Skip when any dep failed/skipped.
          const node = graph.get(id)!;
          const failed = node.dependsOn.some((d) => results.get(d)?.status !== 'success');
          const t0 = this.clockNow();
          if (failed) {
            results.set(id, { id, status: 'skipped', durationMs: 0, startedAt: t0 });
            continue;
          }
          try {
            if (this.timeout > 0) {
              await Promise.race([task(id), this.timeoutPromise(this.timeout)]);
            } else {
              await task(id);
            }
            results.set(id, { id, status: 'success', durationMs: this.clockNow() - t0, startedAt: t0 });
          } catch (e) {
            results.set(id, {
              id,
              status: 'failed',
              durationMs: this.clockNow() - t0,
              startedAt: t0,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      };
      const n = Math.min(this.maxConc, layer.length);
      for (let i = 0; i < n; i++) workers.push(worker());
      await Promise.all(workers);
    }
    void startedAll;
    return layers.flat().map((id) => results.get(id)!);
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, rej) => setTimeout(() => rej(new Error('pipeline timeout')), ms));
  }

  private clockNow(): number {
    return Date.now();
  }
}
