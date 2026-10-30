/**
 * Search Engine — shared types.
 *
 * Vocabulary:
 * - `SymSpellIndex`      — delete-only edit-distance index for spell
 *                           correction (the real SymSpell structure,
 *                           not candidate-generation-by-edits).
 * - `AutocompleteIndex`  — trie with per-node top-k cache and
 *                           popularity decay for query autocomplete.
 * - `QueryUnderstanding` — classifies raw query text into intents
 *                           (exact / fuzzy / phrase / fielded).
 * - `LearningToRank`     — linear LTR re-ranker over hand-computed
 *                           features with pluggable weights.
 *
 * @module SearchLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Spell correction                                                    */
/* ------------------------------------------------------------------ */

export interface SymSpellOptions {
  /** Maximum delete distance precomputed into the index. Default 2. */
  readonly maxEditDistance?: number;
  /** Maximum suggestions returned. Default 5. */
  readonly maxSuggestions?: number;
  /** Minimum term frequency to be suggested. Default 1. */
  readonly minFrequency?: number;
}

export interface SymSpellSuggestion {
  readonly term: string;
  readonly frequency: number;
  /** True Damerau–Levenshtein distance, verified post-lookup. */
  readonly editDistance: number;
  /** Ranking score: frequency discounted by distance. */
  readonly score: number;
}

/* ------------------------------------------------------------------ */
/* Autocomplete                                                        */
/* ------------------------------------------------------------------ */

export interface AutocompleteOptions {
  /** Max completions kept per trie node. Default 10. */
  readonly topK?: number;
  /**
   * Decay factor applied by `decay()` to all weights (0..1).
   * Periodic decay lets recent popularity win over lifetime counts.
   */
  readonly decayFactor?: number;
}

export interface Completion {
  readonly term: string;
  readonly weight: number;
}

/* ------------------------------------------------------------------ */
/* Query understanding                                                 */
/* ------------------------------------------------------------------ */

export type QueryIntent =
  /** quoted → positional phrase match */
  | 'phrase'
  /** `field:value` clauses present → structured search */
  | 'fielded'
  /** single term, no fuzz markers → exact term lookup */
  | 'exact'
  /** contains `~N` or `*` markers → fuzzy/wildcard matching */
  | 'fuzzy'
  /** multi-term free text → ranked disjunction */
  | 'ranked';

export interface QueryTerm {
  readonly text: string;
  readonly field?: string;
  readonly fuzzy?: number;
  readonly wildcard?: boolean;
}

export interface UnderstoodQuery {
  readonly intent: QueryIntent;
  readonly terms: readonly QueryTerm[];
  /** present iff intent === 'phrase' */
  readonly phrase?: string;
  /** original raw query */
  readonly raw: string;
  /** language guess: 'cjk' | 'latin' based on script coverage */
  readonly script: 'cjk' | 'latin';
  /** 0..1 — how confident the classifier is in `intent` */
  readonly confidence: number;
}

/* ------------------------------------------------------------------ */
/* Learning to rank                                                    */
/* ------------------------------------------------------------------ */

/** Feature vector for one candidate document. */
export interface RankFeatures {
  /** BM25 / TF-IDF score from the base ranker. */
  readonly textScore: number;
  /** Recency: e.g. -ageDays or exp(-λ·age). Higher = fresher. */
  readonly recencyScore?: number;
  /** Static quality: pagerank-ish, popularity, rating. */
  readonly popularityScore?: number;
  /** Personalized affinity from user profile. */
  readonly personalizationScore?: number;
  /** Exact title/anchor match bonus (0/1). */
  readonly exactMatch?: number;
  /** Field-specific match boosts merged upstream. */
  readonly fieldBoost?: number;
  /** escape hatch for extra features keyed by name */
  readonly extra?: Readonly<Record<string, number>>;
}

export interface RankCandidate {
  readonly docId: string;
  readonly features: RankFeatures;
}

export interface RankedResult {
  readonly docId: string;
  readonly score: number;
  /** per-feature contributions for explainability */
  readonly contributions: Readonly<Record<string, number>>;
}

/** Named weights for the linear LTR model. */
export interface LtrWeights {
  readonly textScore: number;
  readonly recencyScore: number;
  readonly popularityScore: number;
  readonly personalizationScore: number;
  readonly exactMatch: number;
  readonly fieldBoost: number;
  /** weights for `extra` features, keyed by name */
  readonly extra?: Readonly<Record<string, number>>;
}
