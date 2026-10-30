/**
 * Secrets Rotation — Dependency Graph
 *
 * Derived-secret ordering: secret B may be *derived from* secret A
 * (e.g. a database URL embedding a rotated password, a JWT signing config
 * depending on a KMS key). When A rotates, B must be re-derived — and B
 * must rotate AFTER A completes, never concurrently, or consumers could
 * observe a B built from a stale A.
 *
 * The graph is a DAG:
 *   - `addEdge(dependency, dependent)` — dependent derives from dependency.
 *   - Cycles are rejected on insertion (rotation can never order a cycle).
 *   - `rotationOrder(targets)` returns a topologically sorted execution
 *     plan — dependencies before dependents — via Kahn's algorithm,
 *     O(V+E). Targets not in the graph pass through untouched.
 *   - `impactedBy(root)` returns every secret transitively dependent on
 *     `root` — the blast radius of rotating it.
 *   - `waves(targets)` groups the plan into parallel-safe waves: secrets
 *     in the same wave have no ordering constraint and may rotate
 *     concurrently (level-by-level BFS / longest-path layering).
 *
 * @module SecretsRotation/Engine2
 */

export class DependencyCycleError extends Error {
  constructor(path: readonly string[]) {
    super(`rotation dependency cycle: ${path.join(' → ')}`);
    this.name = 'DependencyCycleError';
  }
}

export class RotationDependencyGraph {
  /** dependency → set of direct dependents. */
  private readonly _dependents = new Map<string, Set<string>>();
  /** dependent → set of direct dependencies. */
  private readonly _dependencies = new Map<string, Set<string>>();

  /** All secret ids known to the graph. */
  get secrets(): ReadonlyArray<string> {
    const s = new Set<string>([...this._dependents.keys(), ...this._dependencies.keys()]);
    return [...s];
  }

  private _ensure(id: string): void {
    if (!this._dependents.has(id)) this._dependents.set(id, new Set());
    if (!this._dependencies.has(id)) this._dependencies.set(id, new Set());
  }

  /**
   * Register `dependent` as derived from `dependency`.
   * Throws {@link DependencyCycleError} when the edge would close a cycle.
   */
  addEdge(dependency: string, dependent: string): void {
    if (dependency === dependent) {
      throw new DependencyCycleError([dependency, dependent]);
    }
    this._ensure(dependency);
    this._ensure(dependent);
    this._dependents.get(dependency)!.add(dependent);
    this._dependencies.get(dependent)!.add(dependency);
    const cycle = this._findCycle();
    if (cycle) {
      // Roll the edge back — the graph stays acyclic.
      this._dependents.get(dependency)!.delete(dependent);
      this._dependencies.get(dependent)!.delete(dependency);
      throw new DependencyCycleError(cycle);
    }
  }

  removeEdge(dependency: string, dependent: string): boolean {
    const removed = this._dependents.get(dependency)?.delete(dependent) ?? false;
    this._dependencies.get(dependent)?.delete(dependency);
    return removed;
  }

  /** Register a standalone secret with no edges (keeps it in plans). */
  addSecret(id: string): void {
    this._ensure(id);
  }

  /** Direct dependencies of `id`. */
  dependenciesOf(id: string): ReadonlyArray<string> {
    return [...(this._dependencies.get(id) ?? new Set<string>())];
  }

  /** Direct dependents of `id`. */
  dependentsOf(id: string): ReadonlyArray<string> {
    return [...(this._dependents.get(id) ?? new Set<string>())];
  }

  /**
   * DFS cycle detector — returns the cycle path when found, else null.
   * Three-color marking: white → gray (in stack) → black (done). An edge
   * into a gray node closes a cycle. O(V+E).
   */
  private _findCycle(): string[] | null {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.secrets) color.set(id, WHITE);
    const stack: string[] = [];

    const visit = (id: string): string[] | null => {
      color.set(id, GRAY);
      stack.push(id);
      for (const dep of this._dependents.get(id) ?? []) {
        const c = color.get(dep) ?? WHITE;
        if (c === GRAY) {
          // Found cycle — extract the loop from the stack.
          const start = stack.indexOf(dep);
          return [...stack.slice(start), dep];
        }
        if (c === WHITE) {
          const r = visit(dep);
          if (r) return r;
        }
      }
      stack.pop();
      color.set(id, BLACK);
      return null;
    };

    for (const id of this.secrets) {
      if (color.get(id) === WHITE) {
        const r = visit(id);
        if (r) return r;
      }
    }
    return null;
  }

  /**
   * Every secret transitively dependent on `root` — BFS downstream.
   * Does NOT include `root` itself.
   */
  impactedBy(root: string): ReadonlyArray<string> {
    const seen = new Set<string>();
    const queue = [...(this._dependents.get(root) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const d of this._dependents.get(id) ?? []) {
        if (!seen.has(d)) queue.push(d);
      }
    }
    return [...seen];
  }

  /**
   * Topological execution order for `targets` — dependencies first.
   * Only nodes inside `targets` (plus their transitive dependencies within
   * the target set) are included; targets missing from the graph are
   * appended at the end in input order (no constraints on them).
   *
   * Kahn's algorithm restricted to the subgraph induced by the closure of
   * `targets` over the *dependency* direction (a target needs all its
   * transitive dependencies rotated first — including dependencies that
   * weren't explicitly requested, which are pulled into the plan).
   */
  rotationOrder(targets: ReadonlyArray<string>): ReadonlyArray<string> {
    // Close targets over transitive dependencies — rotating B requires A.
    const inPlan = new Set<string>();
    const stack = [...targets];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (inPlan.has(id)) continue;
      inPlan.add(id);
      for (const dep of this._dependencies.get(id) ?? []) {
        stack.push(dep);
      }
    }

    // Kahn over the induced subgraph.
    const inDegree = new Map<string, number>();
    for (const id of inPlan) inDegree.set(id, 0);
    for (const id of inPlan) {
      for (const dep of this._dependencies.get(id) ?? []) {
        if (inPlan.has(dep)) {
          inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
        }
      }
    }
    const ready = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const order: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      for (const dep of this._dependents.get(id) ?? []) {
        if (!inPlan.has(dep)) continue;
        const d = inDegree.get(dep)! - 1;
        inDegree.set(dep, d);
        if (d === 0) ready.push(dep);
      }
    }
    if (order.length !== inPlan.size) {
      throw new DependencyCycleError([...inPlan].filter((id) => !order.includes(id)));
    }
    return order;
  }

  /**
   * Level assignment for parallel execution: secrets with the same level
   * share no ordering constraint and may rotate concurrently.
   * level(node) = 0 when no dependencies, else 1 + max(level(dependency)).
   * Returns waves in execution order (wave 0 first).
   */
  waves(targets: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<string>> {
    const order = this.rotationOrder(targets);
    const inPlan = new Set(order);
    const level = new Map<string, number>();
    for (const id of order) {
      let lvl = 0;
      for (const dep of this._dependencies.get(id) ?? []) {
        if (inPlan.has(dep)) {
          lvl = Math.max(lvl, (level.get(dep) ?? 0) + 1);
        }
      }
      level.set(id, lvl);
    }
    const waves: string[][] = [];
    for (const id of order) {
      const l = level.get(id)!;
      while (waves.length <= l) waves.push([]);
      waves[l].push(id);
    }
    return waves;
  }

  /** Human-readable edge list for diagnostics. */
  describe(): ReadonlyArray<string> {
    const out: string[] = [];
    for (const [dep, dependents] of this._dependents) {
      for (const d of dependents) out.push(`${dep} → ${d}`);
    }
    return out.sort();
  }
}
