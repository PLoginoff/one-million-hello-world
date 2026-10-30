/**
 * Flag Dependency Graph
 *
 * Models `requires` edges between flags as a DAG and provides:
 *
 *  - Topological evaluation order (Kahn's algorithm) — prerequisites
 *    always evaluate before their dependents, so a bulk "evaluate all
 *    flags for this context" pass is correct and single-pass.
 *  - Cycle detection — flags A→B→A would recurse forever in naive
 *    evaluation; the graph reports the offending cycle explicitly.
 *  - Impact analysis — `dependentsOf(flag)` answers "what breaks if I
 *    turn this flag off?" — the blast-radius question operators need
 *    before touching a shared prerequisite.
 *  - Orphan detection — `requires` pointing at flags that don't exist
 *    (typo'd keys, deleted flags) — a real config bug class.
 *
 * Complexity: build O(F + E); topological order O(F + E); dependents
 * query O(reachable subgraph). F = flags, E = dependency edges.
 *
 * @module FeatureFlags/Engine2
 */

import { FeatureFlag, FlagDependency } from '../domain/flag-model';

export interface DependencyIssue {
  readonly kind: 'cycle' | 'missing-flag';
  /** Flags involved — for a cycle, the loop members in order. */
  readonly flags: readonly string[];
  readonly detail: string;
}

export interface DependencyGraphReport {
  /** Flags in safe evaluation order (prerequisites first). */
  readonly order: readonly string[];
  /** Structural problems found — empty when the graph is a clean DAG. */
  readonly issues: readonly DependencyIssue[];
}

export class FlagDependencyGraph {
  /** flag → flags it requires (out-edges). */
  private readonly _requires = new Map<string, readonly FlagDependency[]>();
  /** flag → flags that require it (in-edges for impact analysis). */
  private readonly _requiredBy = new Map<string, Set<string>>();

  private constructor() {}

  /** Build the graph from a flag set. */
  static from(flags: readonly FeatureFlag[]): FlagDependencyGraph {
    const g = new FlagDependencyGraph();
    const known = new Set(flags.map((f) => f.key));
    for (const f of flags) {
      const deps = f.requires ?? [];
      g._requires.set(f.key, deps);
      for (const d of deps) {
        if (!known.has(d.flag)) continue; // orphan edges reported in report()
        let set = g._requiredBy.get(d.flag);
        if (!set) {
          set = new Set();
          g._requiredBy.set(d.flag, set);
        }
        set.add(f.key);
      }
    }
    return g;
  }

  /**
   * Kahn's topological sort with cycle reporting.
   *
   * In-degree = number of unmet prerequisites. Repeatedly emit zero-degree
   * nodes; leftover nodes form cycles (or depend on cycles/missing flags).
   */
  report(allFlags: readonly FeatureFlag[]): DependencyGraphReport {
    const known = new Set(allFlags.map((f) => f.key));
    const issues: DependencyIssue[] = [];

    // Missing-flag edges — flag requires something that doesn't exist.
    for (const f of allFlags) {
      for (const d of f.requires ?? []) {
        if (!known.has(d.flag)) {
          issues.push({
            kind: 'missing-flag',
            flags: [f.key, d.flag],
            detail: `flag "${f.key}" requires "${d.flag}" which does not exist`,
          });
        }
      }
    }

    // Kahn's — in-degree counts only edges to *existing* flags.
    const inDegree = new Map<string, number>();
    for (const f of allFlags) {
      const edges = (f.requires ?? []).filter((d) => known.has(d.flag));
      inDegree.set(f.key, edges.length);
    }
    const queue: string[] = [];
    for (const [k, deg] of inDegree) if (deg === 0) queue.push(k);

    const order: string[] = [];
    const deg = new Map(inDegree);
    while (queue.length > 0) {
      const k = queue.shift()!;
      order.push(k);
      for (const dependent of this._requiredBy.get(k) ?? []) {
        const d = deg.get(dependent)! - 1;
        deg.set(dependent, d);
        if (d === 0) queue.push(dependent);
      }
    }

    // Leftovers = cycles (or flags that only depend on cycles/missing).
    const remaining = [...deg.entries()].filter(([k, d]) => d > 0 && known.has(k));
    if (remaining.length > 0) {
      const cycleMembers = this._findCycle(remaining.map(([k]) => k));
      issues.push({
        kind: 'cycle',
        flags: cycleMembers,
        detail: `dependency cycle: ${cycleMembers.join(' → ')}`,
      });
    }

    return { order, issues };
  }

  /**
   * Transitive dependents — everything that would stop working if this
   * flag turned off. BFS over in-edges.
   */
  dependentsOf(flagKey: string): string[] {
    const seen = new Set<string>();
    const queue = [flagKey];
    while (queue.length > 0) {
      const k = queue.shift()!;
      for (const dep of this._requiredBy.get(k) ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }
    return [...seen];
  }

  /** Direct prerequisites of a flag (its `requires` list, keys only). */
  prerequisitesOf(flagKey: string): string[] {
    return (this._requires.get(flagKey) ?? []).map((d) => d.flag);
  }

  /* ---------------------------------------------------------------- */

  /**
   * DFS to extract one concrete cycle path for the error message —
   * friendlier than "nodes 4,7,9 couldn't be ordered".
   */
  private _findCycle(candidates: string[]): string[] {
    const inSet = new Set(candidates);
    const visited = new Set<string>();
    const stack: string[] = [];
    const inStack = new Set<string>();

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      stack.push(node);
      inStack.add(node);
      for (const dep of this._requires.get(node) ?? []) {
        if (!inSet.has(dep.flag)) continue;
        if (inStack.has(dep.flag)) {
          // Found a back edge — slice the stack to the cycle.
          const start = stack.indexOf(dep.flag);
          return [...stack.slice(start), dep.flag];
        }
        if (!visited.has(dep.flag)) {
          const found = dfs(dep.flag);
          if (found) return found;
        }
      }
      stack.pop();
      inStack.delete(node);
      return null;
    };

    for (const c of candidates) {
      if (!visited.has(c)) {
        const cycle = dfs(c);
        if (cycle) return cycle;
      }
    }
    return candidates; // no clean cycle — report the whole leftover set
  }
}
