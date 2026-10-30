/**
 * Translation Memory
 *
 * Stores previously-approved (source, target) translation pairs and
 * retrieves them for new source strings — exact hits first, then
 * fuzzy matches above a similarity threshold. This is the classic TM
 * used by CAT tools: identical or near-identical source segments
 * reuse human translations instead of paying for re-translation.
 *
 * Similarity: character-trigram Dice coefficient, `2·|A∩B|/(|A|+|B|)`
 * over the sets of consecutive 3-char shingles of the normalised
 * strings. Trigrams are the classic TM metric: they absorb suffix
 * changes ("file"→"files" only disturbs a couple of shingles), are
 * insensitive to token reordering at the shingle level, and degrade
 * gracefully on short segments where word-bigram Dice collapses.
 *
 * Storage: entries are bucketed by `sourceLocale|targetLocale` so a
 * lookup never scans pairs for the wrong language pair. Within a
 * bucket it's an O(E) linear scan — fine for in-memory TMs up to
 * ~100k segments; a real deployment would shard by trigram index.
 *
 * @module LocalizationLayer/Engine2
 */

import { TMEntry, TMMatch } from './types';

/** Default minimum similarity for a fuzzy match to be returned. */
export const DEFAULT_FUZZY_THRESHOLD = 0.7;

export class TranslationMemory {
  /** `${source}|${target}` -> entries. */
  private readonly _buckets: Map<string, TMEntry[]>;

  constructor() {
    this._buckets = new Map();
  }

  /** Store one translation pair. Duplicate sources append (context variants). */
  add(entry: TMEntry): void {
    const key = this._key(entry.sourceLocale, entry.targetLocale);
    let bucket = this._buckets.get(key);
    if (!bucket) {
      bucket = [];
      this._buckets.set(key, bucket);
    }
    bucket.push(entry);
  }

  /** Bulk-load entries. */
  addAll(entries: readonly TMEntry[]): void {
    for (const e of entries) this.add(e);
  }

  /**
   * Look up the best match for `source` in the given language pair.
   * Returns the highest-scoring entry at or above `threshold`
   * (default {@link DEFAULT_FUZZY_THRESHOLD}); exact matches bypass
   * the threshold entirely. When `context` is given, entries with a
   * different context are skipped (unscoped entries still match).
   */
  lookup(
    source: string,
    sourceLocale: string,
    targetLocale: string,
    threshold: number = DEFAULT_FUZZY_THRESHOLD,
    context?: string
  ): TMMatch | null {
    const bucket = this._buckets.get(this._key(sourceLocale, targetLocale));
    if (!bucket) return null;

    let best: TMMatch | null = null;
    for (const entry of bucket) {
      if (context !== undefined && entry.context !== undefined && entry.context !== context) {
        continue;
      }
      const score = similarity(source, entry.source);
      if (score >= threshold && (best === null || score > best.score)) {
        best = { entry, score, exact: score === 1 };
      }
    }
    return best;
  }

  /** All matches at or above `threshold`, best first — for translator UIs. */
  lookupAll(
    source: string,
    sourceLocale: string,
    targetLocale: string,
    threshold: number = DEFAULT_FUZZY_THRESHOLD
  ): TMMatch[] {
    const bucket = this._buckets.get(this._key(sourceLocale, targetLocale));
    if (!bucket) return [];
    return bucket
      .map((entry) => ({ entry, score: similarity(source, entry.source), exact: false }))
      .filter((m) => m.score >= threshold)
      .map((m) => ({ ...m, exact: m.score === 1 }))
      .sort((a, b) => b.score - a.score);
  }

  /** Number of stored pairs (optionally for one language pair). */
  size(sourceLocale?: string, targetLocale?: string): number {
    if (sourceLocale === undefined || targetLocale === undefined) {
      let n = 0;
      for (const b of this._buckets.values()) n += b.length;
      return n;
    }
    return this._buckets.get(this._key(sourceLocale, targetLocale))?.length ?? 0;
  }

  private _key(source: string, target: string): string {
    return `${source}|${target}`;
  }
}

// ---------------------------------------------------------------------------
// Similarity — Dice coefficient over word bigrams
// ---------------------------------------------------------------------------

/**
 * Normalise a segment for comparison: lowercase, strip punctuation,
 * collapse whitespace. Placeholders `{name}` are kept as tokens so a
 * message's dynamic parts still contribute to similarity.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}{}_\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Character n-grams (shingles) of normalised text. */
function shingles(text: string, n: number): Set<string> {
  const out = new Set<string>();
  if (text.length < n) {
    if (text.length > 0) out.add(text);
    return out;
  }
  for (let i = 0; i <= text.length - n; i++) {
    out.add(text.slice(i, i + n));
  }
  return out;
}

/** Normalise for shingling: lowercase, collapse whitespace, strip punctuation. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}{}_\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Character-trigram Dice similarity in [0, 1]. Exact equality
 * short-circuits to 1; empty strings score 0.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const na = normalise(a);
  const nb = normalise(b);
  if (na.length === 0 || nb.length === 0) return 0;
  const sa = shingles(na, 3);
  const sb = shingles(nb, 3);
  if (sa.size === 0 || sb.size === 0) return 0;
  let overlap = 0;
  for (const g of sb) {
    if (sa.has(g)) overlap += 1;
  }
  return (2 * overlap) / (sa.size + sb.size);
}
