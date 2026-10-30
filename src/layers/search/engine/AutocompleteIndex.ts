/**
 * AutocompleteIndex — popularity-ranked query completions.
 *
 * The layer's `Trie` (implementations/structures) enumerates all
 * terms under a prefix then sorts — fine for dictionaries of a few
 * thousand, wasteful for query-log autocomplete where a prefix node
 * may cover 100K completions and the UI only shows 8.
 *
 * This index keeps a *bounded top-k list cached at every trie node*:
 * `insert` walks the term's path and updates each node's cached
 * top-k in place, so `complete(prefix)` is O(prefix) to find the
 * node plus O(k) to copy the answer — no subtree traversal at all.
 *
 * Cache maintenance is the subtlety: a term's weight can only grow
 * via `insert`, which means a cached entry stays valid unless the
 * term's weight *increased* past the node's k-th entry — so the
 * update rule is "insert-or-bump, re-sort, truncate", and eviction
 * only loses candidates that were already below the cut.
 *
 * `decay()` multiplies all weights by a factor — periodic decay lets
 * recent searches outrank stale lifetime totals. Because node caches
 * store (term → weight) pairs it must rebuild every cache entry:
 * O(dictionary × term length), run it daily/hourly off the hot path.
 *
 * Fuzzy completion (`fuzzyComplete`) falls back to a bounded
 * edit-distance traversal (like the layer's `fuzzySuggest`) since a
 * misspelled prefix can't use cached lists.
 *
 * @module SearchLayer/Engine
 */

import { AutocompleteOptions, Completion } from './types';

interface AcNode {
  children: Map<string, AcNode>;
  /** weight if a term ends here; -1 otherwise */
  weight: number;
  term?: string;
  /**
   * cached top-k completions of the subtree at this node,
   * sorted by weight desc, capped at `topK`.
   */
  cache: Completion[];
}

export class AutocompleteIndex {
  private readonly _topK: number;
  private readonly _decayFactor: number;
  private readonly _root: AcNode;
  private _termCount: number;

  constructor(options: AutocompleteOptions = {}) {
    this._topK = options.topK ?? 10;
    this._decayFactor = options.decayFactor ?? 0.9;
    this._root = { children: new Map(), weight: -1, cache: [] };
    this._termCount = 0;
  }

  get size(): number {
    return this._termCount;
  }

  /**
   * Insert or bump a term's weight (weights are monotone — repeated
   * searches accumulate). Updates the top-k cache along the path.
   * O(len · k) worst case for cache maintenance.
   */
  insert(term: string, weight = 1): void {
    const path: AcNode[] = [this._root];
    let node = this._root;
    for (const ch of term.toLowerCase()) {
      let child = node.children.get(ch);
      if (child === undefined) {
        child = { children: new Map(), weight: -1, cache: [] };
        node.children.set(ch, child);
      }
      node = child;
      path.push(node);
    }
    if (node.weight < 0) {
      this._termCount++;
      node.weight = weight;
      node.term = term.toLowerCase();
    } else {
      node.weight += weight;
    }
    const w = node.weight;
    const t = node.term!;
    for (const n of path) {
      insertCached(n.cache, { term: t, weight: w }, this._topK);
    }
  }

  /**
   * Top-k completions for `prefix`. O(prefix + k) — the whole point
   * of the cached design.
   */
  complete(prefix: string, k?: number): Completion[] {
    const node = this._find(prefix.toLowerCase());
    if (node === undefined) return [];
    const limit = k ?? this._topK;
    return node.cache.slice(0, limit);
  }

  /**
   * Completions allowing up to `maxEdits` edits *in the prefix*
   * ("tpyo~" still completes "typography"). Bounded DFS over the
   * trie carrying a Levenshtein row — prunes as soon as the row's
   * minimum exceeds the budget.
   */
  fuzzyComplete(
    prefix: string,
    maxEdits = 1,
    k?: number
  ): Completion[] {
    const limit = k ?? this._topK;
    const results = new Map<string, number>();
    const q = prefix.toLowerCase();

    // Levenshtein automaton, one DP row per trie edge. `prevRow[j]` =
    // edit distance between the spelled path and q[0..j). Prune the
    // branch as soon as every cell exceeds the budget — no string
    // under this node can match within maxEdits.
    const dfs = (node: AcNode, prevRow: number[]): void => {
      const rowMin = Math.min(...prevRow);
      if (rowMin > maxEdits) return;
      if (node.term !== undefined && prevRow[q.length] <= maxEdits) {
        results.set(node.term, node.weight);
      }
      for (const [ch, child] of node.children) {
        const row = new Array<number>(q.length + 1);
        row[0] = prevRow[0] + 1;
        for (let j = 1; j <= q.length; j++) {
          const cost = ch === q[j - 1] ? 0 : 1;
          row[j] = Math.min(prevRow[j] + 1, row[j - 1] + 1, prevRow[j - 1] + cost);
        }
        dfs(child, row);
      }
    };

    const initial = new Array<number>(q.length + 1);
    for (let j = 0; j <= q.length; j++) initial[j] = j;
    if (this._root.term !== undefined && initial[q.length] <= maxEdits) {
      results.set(this._root.term, this._root.weight);
    }
    for (const [ch, child] of this._root.children) {
      const row = new Array<number>(q.length + 1);
      row[0] = 1;
      for (let j = 1; j <= q.length; j++) {
        const cost = ch === q[j - 1] ? 0 : 1;
        row[j] = Math.min(initial[j] + 1, row[j - 1] + 1, initial[j - 1] + cost);
      }
      dfs(child, row);
    }

    return [...results.entries()]
      .map(([term, weight]) => ({ term, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /**
   * Multiply every term weight by `decayFactor` and rebuild all node
   * caches. Run periodically so trending queries can displace
   * historical giants.
   */
  decay(factor?: number): void {
    const f = factor ?? this._decayFactor;
    const terms: Array<{ term: string; weight: number }> = [];
    const collect = (node: AcNode): void => {
      if (node.term !== undefined) terms.push({ term: node.term, weight: node.weight * f });
      for (const c of node.children.values()) collect(c);
    };
    collect(this._root);

    // Rebuild: clear weights+caches, re-insert at decayed weights.
    const clear = (node: AcNode): void => {
      node.cache = [];
      node.weight = -1;
      for (const c of node.children.values()) clear(c);
    };
    clear(this._root);
    this._termCount = 0;
    for (const { term, weight } of terms) this.insert(term, weight);
  }

  weightOf(term: string): number {
    const node = this._find(term.toLowerCase());
    return node?.weight ?? -1;
  }

  /* ---------------------------------------------------------------- */

  private _find(prefix: string): AcNode | undefined {
    let node = this._root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (child === undefined) return undefined;
      node = child;
    }
    return node;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Insert-or-bump `c` into a desc-sorted cache of at most `k` entries.
 * If the term is already cached its weight is updated in place;
 * otherwise it's placed by sort order and the tail is dropped.
 */
function insertCached(cache: Completion[], c: Completion, k: number): void {
  const existing = cache.findIndex((x) => x.term === c.term);
  if (existing >= 0) {
    cache[existing] = c;
  } else {
    cache.push(c);
  }
  cache.sort((a, b) => b.weight - a.weight);
  if (cache.length > k) cache.length = k;
}

