/**
 * SymSpellIndex — the real SymSpell data structure.
 *
 * The layer's existing `SpellSuggester` (implementations/structures)
 * generates ~55n candidate edits at query time and filters through
 * the vocabulary. SymSpell flips the work to index time:
 *
 *   Index build: for each dictionary term, enumerate every string
 *   obtainable by deleting up to `maxEditDistance` chars, and record
 *   `variant → [terms]`. Delete-only enumeration is enough because
 *   deletes are symmetric: if distance(a,b) ≤ d then a and b share a
 *   common delete-variant within d/1 deletes each.
 *
 *   Lookup: enumerate the query's own delete-variants, collect
 *   dictionary terms attached to any matching variant, then verify
 *   each candidate with true Damerau–Levenshtein — the index is a
 *   *filter*, distance is still verified (false positives occur when
 *   two strings share a delete but are >d apart).
 *
 * Cost: index space O(dict × C(len, d)); query O(C(len, d) deletes +
 * candidates × len²) verification vs. the naive O(dict × len²) scan.
 * For a 100K vocabulary this is the difference between ~50 candidate
 * checks and 100K distance computations per keystroke.
 *
 * Ranking: `frequency / (editDistance + 1)` — matches Norvig-style
 * correction where frequency dominates ties.
 *
 * @module SearchLayer/Engine
 */

import {
  SymSpellOptions,
  SymSpellSuggestion,
} from './types';

export class SymSpellIndex {
  private readonly _maxEdits: number;
  private readonly _maxSuggestions: number;
  private readonly _minFreq: number;

  /** delete-variant → dictionary terms that produced it. */
  private readonly _variants: Map<string, Set<string>>;
  /** dictionary term → frequency. */
  private readonly _freq: Map<string, number>;

  constructor(options: SymSpellOptions = {}) {
    this._maxEdits = options.maxEditDistance ?? 2;
    this._maxSuggestions = options.maxSuggestions ?? 5;
    this._minFreq = options.minFrequency ?? 1;
    this._variants = new Map();
    this._freq = new Map();
  }

  /** Add or bump a term's frequency. O(C(len, d)) variant updates. */
  add(term: string, frequency = 1): void {
    const t = term.toLowerCase();
    const isNew = !this._freq.has(t);
    this._freq.set(t, (this._freq.get(t) ?? 0) + frequency);
    if (!isNew) return; // variants already indexed for this term
    for (const v of deletes(t, this._maxEdits)) {
      let set = this._variants.get(v);
      if (set === undefined) {
        set = new Set();
        this._variants.set(v, set);
      }
      set.add(t);
    }
  }

  addAll(terms: readonly string[], frequency = 1): void {
    for (const t of terms) this.add(t, frequency);
  }

  frequencyOf(term: string): number {
    return this._freq.get(term.toLowerCase()) ?? 0;
  }

  get termCount(): number {
    return this._freq.size;
  }

  get variantCount(): number {
    return this._variants.size;
  }

  /**
   * Look up corrections for `input`.
   *
   * 1. Exact hit → the term itself with distance 0 (and continue to
   *    also collect alternatives at distance ≥1 — callers may want
   *    "did you mean" even for in-vocabulary queries).
   * 2. Delete-variant expansion of the input.
   * 3. Candidate verification with true edit distance.
   */
  lookup(input: string): SymSpellSuggestion[] {
    const q = input.toLowerCase();
    const candidates = new Map<string, number>(); // term → best (min) dist

    // Distance-0 fast path.
    if (this._freq.has(q)) candidates.set(q, 0);

    // Every delete-variant of the query, plus the query itself, may
    // carry dictionary terms in the index.
    const probes = new Set<string>([q]);
    for (const v of deletes(q, this._maxEdits)) probes.add(v);

    for (const probe of probes) {
      const terms = this._variants.get(probe);
      if (terms === undefined) continue;
      for (const term of terms) {
        if (candidates.has(term)) continue; // already verified
        const dist = damerauLevenshteinBounded(q, term, this._maxEdits);
        if (dist <= this._maxEdits) candidates.set(term, dist);
      }
    }

    const out: SymSpellSuggestion[] = [];
    for (const [term, dist] of candidates) {
      const frequency = this._freq.get(term) ?? 0;
      if (frequency < this._minFreq) continue;
      out.push({
        term,
        frequency,
        editDistance: dist,
        score: frequency / (dist + 1),
      });
    }
    out.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
    return out.slice(0, this._maxSuggestions);
  }

  /** Best single correction, or undefined when nothing is within d. */
  correct(input: string): string | undefined {
    return this.lookup(input)[0]?.term;
  }
}

/* ------------------------------------------------------------------ */
/* Delete-variant enumeration                                          */
/* ------------------------------------------------------------------ */

/**
 * All strings obtainable from `s` by deleting 1..`maxEdits` chars.
 * Recursive DFS; result size = Σ C(len, k) for k=1..maxEdits.
 * `s` itself is NOT included (callers add it explicitly).
 */
export function deletes(s: string, maxEdits: number): Set<string> {
  const out = new Set<string>();
  const walk = (cur: string, depth: number): void => {
    if (depth === maxEdits || cur.length === 0) return;
    for (let i = 0; i < cur.length; i++) {
      const next = cur.slice(0, i) + cur.slice(i + 1);
      if (!out.has(next)) {
        out.add(next);
        walk(next, depth + 1);
      }
    }
  };
  walk(s, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Bounded Damerau–Levenshtein                                         */
/* ------------------------------------------------------------------ */

/**
 * True Damerau–Levenshtein distance with early exit when the distance
 * provably exceeds `maxDist`. The length-difference bound is checked
 * up front; the DP keeps only two rows so it's O(len·len) time,
 * O(len) space — the classic optimal-alignment (OSA) variant, which
 * counts each transposition once.
 *
 * Returns maxDist+1 (i.e. "too far") when it exceeds the bound.
 */
export function damerauLevenshteinBounded(
  a: string,
  b: string,
  maxDist: number
): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (a === b) return 0;

  const m = a.length;
  const n = b.length;
  // H rows: prev-prev, prev, cur (needed for transposition).
  let h2 = new Array<number>(n + 1).fill(0);
  let h1 = new Array<number>(n + 1);
  let h0 = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) h1[j] = j;

  for (let i = 1; i <= m; i++) {
    h0[0] = i;
    let rowMin = h0[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        h1[j] + 1, // delete
        h0[j - 1] + 1, // insert
        h1[j - 1] + cost // substitute / match
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, h2[j - 2] + 1); // transposition
      }
      h0[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1; // whole row above bound
    const tmp = h2;
    h2 = h1;
    h1 = h0;
    h0 = tmp;
  }
  return h1[n];
}
