/**
 * FuzzyMatch
 *
 * String similarity utilities: Levenshtein edit distance, Damerau
 * transposition variant, n-gram (Jaccard/dice) similarity, and a combined
 * fuzzy-term matcher used for tolerant query expansion.
 */

/** Standard Levenshtein distance with two-row DP. O(min(m,n)) space. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // ensure b is the shorter string
  let s = a;
  let t = b;
  if (t.length > s.length) {
    s = b;
    t = a;
  }
  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

/**
 * Damerau-Levenshtein distance (optimal string alignment variant):
 * like Levenshtein but adjacent transpositions count as one edit.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[m][n];
}

/** Normalized similarity in [0,1] derived from edit distance. */
export function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Extract the set of character n-grams of a string. */
export function ngrams(s: string, n: number): Set<string> {
  const grams = new Set<string>();
  if (n <= 0 || s.length < n) {
    if (s.length > 0) grams.add(s);
    return grams;
  }
  for (let i = 0; i <= s.length - n; i++) {
    grams.add(s.slice(i, i + n));
  }
  return grams;
}

/** Jaccard similarity over n-gram sets, in [0,1]. */
export function ngramJaccard(a: string, b: string, n = 2): number {
  const ga = ngrams(a, n);
  const gb = ngrams(b, n);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

/** Sorensen-Dice coefficient over n-gram sets, in [0,1]. */
export function ngramDice(a: string, b: string, n = 2): number {
  const ga = ngrams(a, n);
  const gb = ngrams(b, n);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

export type FuzzyMetric = 'levenshtein' | 'damerau' | 'ngram-jaccard' | 'ngram-dice';

export function similarity(a: string, b: string, metric: FuzzyMetric = 'ngram-dice'): number {
  switch (metric) {
    case 'levenshtein':
    case 'damerau': {
      const dist = metric === 'levenshtein' ? levenshtein(a, b) : damerauLevenshtein(a, b);
      const maxLen = Math.max(a.length, b.length);
      return maxLen === 0 ? 1 : 1 - dist / maxLen;
    }
    case 'ngram-jaccard':
      return ngramJaccard(a, b);
    case 'ngram-dice':
      return ngramDice(a, b);
  }
}

export interface FuzzyCandidate {
  readonly term: string;
  readonly score: number;
}

/**
 * Find vocabulary terms similar to `term`. Used for fuzzy query expansion
 * (like Lucene's FuzzyQuery with a max-edits threshold).
 */
export function fuzzyExpand(
  term: string,
  vocabulary: readonly string[],
  options: { maxEdits?: number; minSimilarity?: number; limit?: number } = {}
): FuzzyCandidate[] {
  const maxEdits = options.maxEdits ?? 2;
  const minSimilarity = options.minSimilarity ?? 0.0;
  const limit = options.limit ?? 25;
  const candidates: FuzzyCandidate[] = [];
  for (const candidate of vocabulary) {
    // length pruning: edit distance >= |len difference|
    if (Math.abs(candidate.length - term.length) > maxEdits) continue;
    const dist = levenshtein(term, candidate);
    if (dist > maxEdits) continue;
    const sim = 1 - dist / Math.max(term.length, candidate.length);
    if (sim < minSimilarity) continue;
    candidates.push({ term: candidate, score: sim });
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates.slice(0, limit);
}

/** Common prefix length — useful for prefix queries and autocomplete. */
export function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** True if `prefix` is a prefix of `term` (case-sensitive). */
export function hasPrefix(term: string, prefix: string): boolean {
  return term.startsWith(prefix);
}
