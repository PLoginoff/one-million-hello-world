/**
 * Scheduling Engine2 — Dependency DAG
 *
 * JobScheduler enforces dependencies at dispatch time (a job waits until
 * its deps succeeded). That's enough to RUN a DAG but not to REASON about
 * one. This module adds the graph algorithms ops teams need:
 *
 *   - `topoLayers()` — Kahn's algorithm BFS producing execution layers:
 *     jobs in layer i have all dependencies in layers < i, so a parallel
 *     runner can execute each layer concurrently.
 *   - `criticalPath()` — longest weighted chain through the DAG; the
 *     makespan lower bound. Duration defaults per-job (estDurationMs).
 *   - `downstream()` / `upstream()` — transitive closure for impact
 *     analysis ("what breaks if extract-orders fails?").
 *   - Cycle detection with the actual CYCLE PATH in the error — a bare
 *     "cycle detected" forces a manual hunt through hundreds of edges.
 *
 * Complexity: topo O(V + E); critical path O(V + E) via topological DP;
 * closures O(V + E) each.
 *
 * @module SchedulingLayer/Engine2
 */

export interface DagJob {
  readonly jobId: string;
  /** Jobs that must complete before this one runs. */
  readonly dependsOn?: readonly string[];
  /** Estimated duration — critical-path weight (default 0). */
  readonly estDurationMs?: number;
}

export interface CriticalPath {
  /** Job ids on the longest chain, in execution order. */
  readonly jobs: readonly string[];
  /** Sum of durations along the chain — makespan lower bound. */
  readonly totalMs: number;
}

export class CycleError extends Error {
  /** The cycle path a→b→…→a when identifiable. */
  readonly path: readonly string[];
  constructor(path: readonly string[]) {
    super(`dependency cycle: ${path.join(' → ')}`);
    this.name = 'CycleError';
    this.path = path;
  }
}

export class DependencyDAG {
  private readonly _jobs = new Map<string, DagJob>();
  /** jobId → direct dependents (edge direction: dep → dependent). */
  private readonly _edges = new Map<string, Set<string>>();

  add(job: DagJob): void {
    this._jobs.set(job.jobId, job);
    for (const dep of job.dependsOn ?? []) {
      if (!this._jobs.has(dep)) {
        throw new Error(`job '${job.jobId}' depends on unknown job '${dep}'`);
      }
      let out = this._edges.get(dep);
      if (!out) {
        out = new Set();
        this._edges.set(dep, out);
      }
      out.add(job.jobId);
    }
    // Fail fast on cycles introduced by this edge set.
    this._assertAcyclic(job.jobId);
  }

  /** DFS from `from` — is `target` reachable? Reports the path on hit. */
  private _assertAcyclic(from: string): void {
    // A cycle exists iff `from` can reach itself. DFS recording the path.
    const path: string[] = [];
    const seen = new Set<string>();
    const dfs = (n: string): boolean => {
      if (n === from && path.length > 0) return true;
      if (seen.has(n)) return false;
      seen.add(n);
      path.push(n);
      for (const m of this._edges.get(n) ?? []) {
        if (dfs(m)) return true;
      }
      path.pop();
      return false;
    };
    // Self-loop edge (job depends on itself) — reject immediately.
    if (this._edges.get(from)?.has(from)) {
      throw new CycleError([from, from]);
    }
    for (const m of this._edges.get(from) ?? []) {
      path.length = 0;
      if (m === from) throw new CycleError([from, from]);
      if (dfs(m)) {
        // path holds the walk into the cycle; prepend `from`.
        const cycle = [from, ...path];
        // Trim anything before the repeated start for a clean a→…→a path.
        const rep = cycle.indexOf(cycle[cycle.length - 1]);
        throw new CycleError(rep > 0 ? cycle.slice(rep) : cycle);
      }
    }
  }

  /** In-degree map used by Kahn's algorithm. */
  private _inDegree(): Map<string, number> {
    const inDeg = new Map<string, number>();
    for (const id of this._jobs.keys()) inDeg.set(id, 0);
    for (const outs of this._edges.values()) {
      for (const to of outs) inDeg.set(to, (inDeg.get(to) ?? 0) + 1);
    }
    return inDeg;
  }

  /**
   * Kahn's BFS by layers: layer 0 = sources; layer i+1 = jobs whose every
   * dep sits in earlier layers. Throws CycleError when the graph can't be
   * fully consumed (defense in depth — add() already rejects cycles).
   */
  topoLayers(): string[][] {
    const inDeg = this._inDegree();
    const layers: string[][] = [];
    let frontier = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    let consumed = 0;

    while (frontier.length > 0) {
      layers.push(frontier);
      consumed += frontier.length;
      const next: string[] = [];
      for (const id of frontier) {
        for (const m of this._edges.get(id) ?? []) {
          const d = inDeg.get(m)! - 1;
          inDeg.set(m, d);
          if (d === 0) next.push(m);
        }
      }
      frontier = next;
    }
    if (consumed !== this._jobs.size) throw new CycleError([]);
    return layers;
  }

  /** Execution order as a flat topological sequence. */
  topoOrder(): string[] {
    return this.topoLayers().flat();
  }

  /**
   * Longest-path DP over topological order. `earliest[j]` = earliest
   * FINISH time of j = own duration + max(earliest finish of its deps).
   * The max over all jobs gives the chain that bounds the schedule.
   */
  criticalPath(): CriticalPath {
    const order = this.topoOrder();
    const finish = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const dur = (id: string): number => this._jobs.get(id)?.estDurationMs ?? 0;

    for (const id of order) {
      let earliestStart = 0;
      let pred: string | null = null;
      for (const dep of this._jobs.get(id)?.dependsOn ?? []) {
        const f = finish.get(dep) ?? 0;
        if (f > earliestStart) {
          earliestStart = f;
          pred = dep;
        }
      }
      finish.set(id, earliestStart + dur(id));
      parent.set(id, pred);
    }

    // Chain end = max-finish job; walk parents back to reconstruct.
    let end: string | null = null;
    let best = -1;
    for (const [id, f] of finish) {
      if (f > best) {
        best = f;
        end = id;
      }
    }
    const jobs: string[] = [];
    for (let n = end; n !== null; n = parent.get(n) ?? null) jobs.unshift(n);
    return { jobs, totalMs: Math.max(0, best) };
  }

  /** All jobs transitively depending on `jobId` (impact set). */
  downstream(jobId: string): Set<string> {
    if (!this._jobs.has(jobId)) throw new Error(`unknown job '${jobId}'`);
    const out = new Set<string>();
    const stack = [...(this._edges.get(jobId) ?? [])];
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (out.has(n)) continue;
      out.add(n);
      for (const m of this._edges.get(n) ?? []) stack.push(m);
    }
    return out;
  }

  /** All jobs `jobId` transitively depends on. */
  upstream(jobId: string): Set<string> {
    if (!this._jobs.has(jobId)) throw new Error(`unknown job '${jobId}'`);
    const out = new Set<string>();
    const visit = (id: string): void => {
      for (const dep of this._jobs.get(id)?.dependsOn ?? []) {
        if (out.has(dep)) continue;
        out.add(dep);
        visit(dep);
      }
    };
    visit(jobId);
    return out;
  }

  /** Ready-to-run set given completed deps — for incremental dispatch. */
  ready(completed: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (const [id, job] of this._jobs) {
      if (completed.has(id)) continue;
      const deps = job.dependsOn ?? [];
      if (deps.every((d) => completed.has(d))) out.push(id);
    }
    return out;
  }

  get size(): number {
    return this._jobs.size;
  }
}
