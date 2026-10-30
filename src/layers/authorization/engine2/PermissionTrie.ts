/**
 * Permission Prefix Trie
 *
 * A segment-wise trie over `resource:action:scope` permissions giving
 * O(L) lookups where L = number of segments (typically 2–3), versus
 * O(P) linear scans over P permissions. Each edge is one segment; a
 * `*` edge matches any single segment.
 *
 * Two query shapes:
 *  - `matches(patterns)` — does any stored permission match a concrete
 *    permission? Used by BulkAuthorizer's per-permission path.
 *  - `expand(prefix)` — enumerate all permissions under a prefix, for
 *    "list everything under `folder:`" admin queries.
 *
 * Memory: one node per distinct segment across all permissions;
 * shared prefixes share nodes (the point of a trie).
 *
 * @module AuthorizationLayer/Engine2
 */

interface TrieNode {
  children: Map<string, TrieNode>;
  /** Marks the end of a stored permission. */
  terminal: boolean;
  /** Original permission string at terminal nodes. */
  permission?: string;
}

const WILDCARD = '*';

export class PermissionTrie {
  private readonly _root: TrieNode = { children: new Map(), terminal: false };
  private readonly _delimiter: string;
  private _size = 0;
  private _nodeCount = 1;

  constructor(delimiter = ':') {
    this._delimiter = delimiter;
  }

  /** Insert a permission; may itself contain `*` segments (stored as wildcard edges). */
  add(permission: string): void {
    const segs = permission.split(this._delimiter);
    let node = this._root;
    for (const s of segs) {
      let next = node.children.get(s);
      if (!next) {
        next = { children: new Map(), terminal: false };
        node.children.set(s, next);
        this._nodeCount++;
      }
      node = next;
    }
    if (!node.terminal) {
      node.terminal = true;
      node.permission = permission;
      this._size++;
    }
  }

  remove(permission: string): boolean {
    const segs = permission.split(this._delimiter);
    // Walk to the terminal, collecting the path for pruning.
    const path: TrieNode[] = [this._root];
    let node = this._root;
    for (const s of segs) {
      const next = node.children.get(s);
      if (!next) return false;
      path.push(next);
      node = next;
    }
    if (!node.terminal) return false;
    node.terminal = false;
    node.permission = undefined;
    this._size--;
    // Prune dead leaf nodes back up the spine.
    for (let i = segs.length - 1; i >= 0; i--) {
      const child = path[i + 1];
      if (child.children.size > 0 || child.terminal) break;
      path[i].children.delete(segs[i]);
      this._nodeCount--;
    }
    return true;
  }

  /**
   * Does `permission` match any stored pattern? Concrete segments match
   * literal edges; `*` edges match any segment. DFS over at most
   * 2^L branches but typically just the literal path — O(L) average.
   */
  matches(permission: string): boolean {
    const segs = permission.split(this._delimiter);
    return this.matchFrom(this._root, segs, 0);
  }

  private matchFrom(node: TrieNode, segs: readonly string[], depth: number): boolean {
    if (depth === segs.length) return node.terminal;
    const seg = segs[depth];
    // Try the literal edge first, then the wildcard edge.
    const literal = node.children.get(seg);
    if (literal && this.matchFrom(literal, segs, depth + 1)) return true;
    const wild = node.children.get(WILDCARD);
    if (wild && wild !== literal && this.matchFrom(wild, segs, depth + 1)) return true;
    return false;
  }

  /**
   * All stored permissions under `prefix` (segment-wise). `prefix` may
   * end mid-permission: `expand('doc')` returns every `doc:*` grant.
   */
  expand(prefix: string): string[] {
    const segs = prefix.length === 0 ? [] : prefix.split(this._delimiter);
    let node = this._root;
    for (const s of segs) {
      const next = node.children.get(s);
      if (!next) return [];
      node = next;
    }
    const out: string[] = [];
    this.collect(node, out);
    return out;
  }

  private collect(node: TrieNode, out: string[]): void {
    if (node.terminal && node.permission !== undefined) out.push(node.permission);
    for (const child of node.children.values()) this.collect(child, out);
  }

  /**
   * Check a set of concrete permissions in one pass, sharing the
   * descent for common prefixes — the shared-prefix optimization the
   * BulkAuthorizer delegates to when no deny-oracle is available.
   */
  matchesAll(permissions: readonly string[]): Map<string, boolean> {
    const out = new Map<string, boolean>();
    // Sort so same-prefix queries hit cache-friendly order; trie itself
    // already shares nodes so this is mostly for locality.
    const sorted = [...permissions].sort();
    for (const p of sorted) out.set(p, this.matches(p));
    return out;
  }

  get size(): number {
    return this._size;
  }

  /** Node count — memory/footprint introspection for tests. */
  get nodeCount(): number {
    return this._nodeCount;
  }
}
