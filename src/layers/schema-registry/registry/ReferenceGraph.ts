/**
 * ReferenceGraph — cross-subject schema dependencies.
 *
 * Directed graph: edge A -> B means "schemas under subject A reference
 * schemas under subject B" (A depends on B).
 *
 * Operations:
 *  - addEdge/removeEdge on register/unregister
 *  - dependenciesOf(subject): transitive closure of what subject needs
 *  - dependentsOf(subject): transitive closure of who needs subject —
 *    deletion safety check: hard-deleting a subject with live
 *    dependents is refused by the store
 *  - wouldCycle(from, to): DFS check used at registration to reject
 *    circular references
 *
 * @module SchemaRegistry/Registry
 */

export class ReferenceGraph {
  /** subject -> set of subjects it depends on. */
  private readonly _edges: Map<string, Set<string>> = new Map();

  /** Record a dependency edge. */
  addEdge(from: string, to: string): void {
    let set = this._edges.get(from);
    if (!set) {
      set = new Set();
      this._edges.set(from, set);
    }
    set.add(to);
  }

  /** Remove a dependency edge (all versions of `from` may share it). */
  removeEdge(from: string, to: string): void {
    const set = this._edges.get(from);
    if (set) {
      set.delete(to);
      if (set.size === 0) this._edges.delete(from);
    }
  }

  /** Remove all edges incident to a subject (subject deletion). */
  removeSubject(subject: string): void {
    this._edges.delete(subject);
    for (const set of this._edges.values()) set.delete(subject);
  }

  /** Direct dependencies of a subject. */
  directDependencies(subject: string): string[] {
    return [...(this._edges.get(subject) ?? [])];
  }

  /** Transitive closure of dependencies (BFS). O(V+E). */
  dependenciesOf(subject: string): string[] {
    const seen = new Set<string>();
    const queue = [subject];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const dep of this._edges.get(cur) ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }
    seen.delete(subject);
    return [...seen];
  }

  /** Subjects that transitively depend on `subject`. O(V+E). */
  dependentsOf(subject: string): string[] {
    // Reverse graph on demand — cheaper than maintaining both.
    const rev = new Map<string, Set<string>>();
    for (const [from, tos] of this._edges) {
      for (const to of tos) {
        let set = rev.get(to);
        if (!set) {
          set = new Set();
          rev.set(to, set);
        }
        set.add(from);
      }
    }
    const seen = new Set<string>();
    const queue = [subject];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const dep of rev.get(cur) ?? []) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }
    seen.delete(subject);
    return [...seen];
  }

  /** Would adding edge `from -> to` create a cycle? DFS from `to` back to `from`. */
  wouldCycle(from: string, to: string): boolean {
    if (from === to) return true;
    const seen = new Set<string>();
    const stack = [to];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === from) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const next of this._edges.get(cur) ?? []) stack.push(next);
    }
    return false;
  }

  /** All edges as [from, to] pairs (diagnostics). */
  edges(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [from, tos] of this._edges) {
      for (const to of tos) out.push([from, to]);
    }
    return out;
  }
}
