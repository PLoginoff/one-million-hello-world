/**
 * CommitOrdering — topological ordering of entity writes by dependency.
 *
 * When a unit of work commits, entity types may have foreign-key-style
 * dependencies (e.g. `OrderLine` depends on `Order`, `Order` depends on
 * `Customer`). To satisfy referential integrity we must:
 *
 *   INSERT:  dependencies first (parent before child)
 *   DELETE:  reverse order (child before parent)
 *   UPDATE:  either order works, but we reuse INSERT ordering
 *
 * Dependencies are declared as edges `from → dependsOn`. The sorter runs
 * Kahn's algorithm (BFS over indegree) — O(V + E). Cycles are detected
 * and reported with the participating types.
 *
 * @module UnitOfWorkLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** A dependency edge: `from` must be persisted AFTER `dependsOn`. */
export interface DependencyEdge {
  readonly from: string;
  readonly dependsOn: string;
}

/** A cycle detected during topological sort. */
export class DependencyCycleError extends Error {
  readonly cycle: readonly string[];
  constructor(cycle: readonly string[]) {
    super(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'DependencyCycleError';
    this.cycle = cycle;
  }
}

// ---------------------------------------------------------- registration

/**
 * DependencyGraph — registers type-level dependencies, produces
 * topological orderings for a subset of entity types.
 */
export class DependencyGraph {
  private readonly _edges = new Map<string, Set<string>>();

  /** Declare that `from` depends on `dependsOn` (insert order constraint). */
  add(from: string, dependsOn: string): this {
    if (from === dependsOn) {
      throw new Error(`Self-dependency on '${from}' is not allowed`);
    }
    let set = this._edges.get(from);
    if (!set) {
      set = new Set();
      this._edges.set(from, set);
    }
    set.add(dependsOn);
    return this;
  }

  /** All dependencies of a type. */
  dependenciesOf(type: string): string[] {
    return [...(this._edges.get(type) ?? [])];
  }

  /** All types that depend on `type`. */
  dependentsOf(type: string): string[] {
    const out: string[] = [];
    for (const [from, deps] of this._edges) {
      if (deps.has(type)) out.push(from);
    }
    return out;
  }

  /** All types appearing in the graph (as source or target). */
  types(): string[] {
    const s = new Set<string>();
    for (const [from, deps] of this._edges) {
      s.add(from);
      for (const d of deps) s.add(d);
    }
    return [...s];
  }

  /**
   * Topological sort over the given type subset. Only edges where BOTH
   * endpoints are in `subset` constrain the order — dependencies outside
   * the working set are already persisted.
   *
   * @returns insertion-ordered type list (dependencies first)
   * @throws DependencyCycleError when the subset contains a cycle
   */
  order(subset: Iterable<string>): string[] {
    const types = [...new Set(subset)];

    // Build indegree map restricted to the subset.
    const inSubset = new Set(types);
    const indegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    for (const t of types) {
      indegree.set(t, 0);
      outEdges.set(t, []);
    }
    for (const t of types) {
      for (const dep of this._edges.get(t) ?? []) {
        if (!inSubset.has(dep)) continue;
        // edge dep → t (dep must come first)
        indegree.set(t, (indegree.get(t) ?? 0) + 1);
        outEdges.get(dep)?.push(t);
      }
    }

    // Kahn's algorithm — BFS over zero-indegree nodes.
    const queue: string[] = types.filter((t) => (indegree.get(t) ?? 0) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const t = queue.shift()!;
      order.push(t);
      for (const next of outEdges.get(t) ?? []) {
        const d = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, d);
        if (d === 0) queue.push(next);
      }
    }

    if (order.length !== types.length) {
      // Find a cycle for the error message — DFS on remaining nodes.
      const remaining = types.filter((t) => (indegree.get(t) ?? 0) > 0);
      const cycle = this._findCycle(remaining, inSubset);
      throw new DependencyCycleError(cycle.length > 0 ? cycle : remaining);
    }

    return order;
  }

  /** Reverse topological order — for deletes. */
  orderForDelete(subset: Iterable<string>): string[] {
    return this.order(subset).reverse();
  }

  /**
   * DFS to find a cycle among the remaining (non-sorted) nodes.
   * Returns the cycle as a list including the repeated start node.
   */
  private _findCycle(candidates: string[], inSubset: Set<string>): string[] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];
    const remaining = new Set(candidates);

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      stack.add(node);
      path.push(node);
      for (const dep of this._edges.get(node) ?? []) {
        if (!remaining.has(dep) || !inSubset.has(dep)) continue;
        if (!visited.has(dep)) {
          const found = dfs(dep);
          if (found) return found;
        } else if (stack.has(dep)) {
          // Found a back edge — the cycle is path[depIdx..] + dep.
          const idx = path.indexOf(dep);
          return [...path.slice(idx), dep];
        }
      }
      stack.delete(node);
      path.pop();
      return null;
    };

    for (const c of candidates) {
      if (!visited.has(c)) {
        const found = dfs(c);
        if (found) return found;
      }
    }
    return [];
  }
}
