/**
 * Trie
 *
 * Prefix tree for autocomplete and term-dictionary services. Stores
 * weighted terms; supports prefix enumeration, top-k suggestions by
 * weight, and fuzzy traversal bounded by edit distance.
 */

interface TrieNode {
  children: Map<string, TrieNode>;
  /** weight of term ending here, or -1 if not a terminal */
  weight: number;
  term?: string;
}

export interface Suggestion {
  readonly term: string;
  readonly weight: number;
}

export class Trie {
  /** internal root; exposed for fuzzy traversal */
  readonly root: TrieNode = { children: new Map(), weight: -1 };
  private termCount = 0;

  insert(term: string, weight = 1): void {
    let node = this.root;
    for (const ch of term) {
      let child = node.children.get(ch);
      if (child === undefined) {
        child = { children: new Map(), weight: -1 };
        node.children.set(ch, child);
      }
      node = child;
    }
    if (node.weight < 0) this.termCount++;
    node.weight = Math.max(node.weight, weight);
    node.term = term;
  }

  has(term: string): boolean {
    const node = this.find(term);
    return node !== undefined && node.weight >= 0;
  }

  weightOf(term: string): number {
    const node = this.find(term);
    return node?.weight ?? -1;
  }

  remove(term: string): boolean {
    if (!this.has(term)) return false;
    const path: TrieNode[] = [this.root];
    let node = this.root;
    for (const ch of term) {
      const child = node.children.get(ch);
      if (child === undefined) return false;
      path.push(child);
      node = child;
    }
    node.weight = -1;
    node.term = undefined;
    this.termCount--;
    // prune dead branches
    for (let i = term.length - 1; i >= 0; i--) {
      const n = path[i + 1];
      if (n.children.size === 0 && n.weight < 0) {
        path[i].children.delete(term[i]);
      } else {
        break;
      }
    }
    return true;
  }

  private find(prefix: string): TrieNode | undefined {
    let node = this.root;
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (child === undefined) return undefined;
      node = child;
    }
    return node;
  }

  /** All terms starting with prefix (unordered). */
  withPrefix(prefix: string): string[] {
    const node = this.find(prefix);
    if (node === undefined) return [];
    const out: string[] = [];
    const walk = (n: TrieNode): void => {
      if (n.weight >= 0 && n.term !== undefined) out.push(n.term);
      for (const c of n.children.values()) walk(c);
    };
    walk(node);
    return out;
  }

  /** Top-k suggestions under a prefix, ranked by weight. */
  suggest(prefix: string, k = 10): Suggestion[] {
    const node = this.find(prefix);
    if (node === undefined) return [];
    const heap: Suggestion[] = [];
    const walk = (n: TrieNode): void => {
      if (n.weight >= 0 && n.term !== undefined) {
        heap.push({ term: n.term, weight: n.weight });
      }
      for (const c of n.children.values()) walk(c);
    };
    walk(node);
    heap.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
    return heap.slice(0, k);
  }

  size(): number {
    return this.termCount;
  }
}

/**
 * Fuzzy traversal over the trie: finds all terms within `maxEdits` of
 * `term` using a row of the Levenshtein DP matrix per node.
 */
export function fuzzySuggest(
  trie: Trie,
  term: string,
  maxEdits: number,
  limit = 10
): Suggestion[] {
  const results: Array<{ term: string; weight: number; distance: number }> = [];
  const cols = term.length + 1;
  const initial = Array.from({ length: cols }, (_, i) => i);

  const walk = (node: TrieNode, letter: string, prevRow: number[]): void => {
    const current: number[] = [prevRow[0] + 1];
    for (let c = 1; c < cols; c++) {
      const cost = term[c - 1] === letter ? 0 : 1;
      current.push(
        Math.min(current[c - 1] + 1, prevRow[c] + 1, prevRow[c - 1] + cost)
      );
    }
    if (Math.min(...current) > maxEdits) return; // prune branch
    if (node.weight >= 0 && current[cols - 1] <= maxEdits && node.term !== undefined) {
      results.push({ term: node.term, weight: node.weight, distance: current[cols - 1] });
    }
    for (const [ch, child] of node.children) {
      walk(child, ch, current);
    }
  };

  for (const [ch, child] of trie.root.children) {
    walk(child, ch, initial);
  }
  results.sort((a, b) => a.distance - b.distance || b.weight - a.weight);
  return results.slice(0, limit).map((r) => ({ term: r.term, weight: r.weight }));
}

/** Build a trie from a weighted vocabulary. */
export function buildTrie(
  entries: ReadonlyArray<{ term: string; weight?: number }>
): Trie {
  const t = new Trie();
  for (const e of entries) t.insert(e.term, e.weight ?? 1);
  return t;
}
