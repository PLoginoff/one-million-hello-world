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
 * - `EmbeddingIndex`     — SoA dense-embedding index with exact k-NN
 *                           and an HNSW-style navigable small-world
 *                           graph for approximate search.
 * - `HybridScorer`       — merges lexical (BM25) and vector candidate
 *                           lists via reciprocal rank fusion or
 *                           min-max score blending.
 * - `EmbeddingCache`     — query→embedding cache (LRU + TTL) in
 *                           front of an embedder function.
 * - `SemanticDedup`      — near-duplicate detection over the
 *                           embedding index (sim ≥ τ cluster + minhash).
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

/* ------------------------------------------------------------------ */
/* Vector / embedding search                                           */
/* ------------------------------------------------------------------ */

/** Distance/similarity metric supported by the embedding index. */
export type EmbeddingMetric =
  /** normalized dot product; best for unit-norm embeddings */
  | 'cosine'
  /** squared L2 distance (monotone with L2, avoids the sqrt) */
  | 'l2'
  /** raw inner product — for pre-normalized MIPS workloads */
  | 'dot';

export interface EmbeddingIndexOptions {
  /** Vector dimension. Required — all inserts are checked. */
  readonly dims: number;
  /** Similarity metric. Default 'cosine'. */
  readonly metric?: EmbeddingMetric;
  /**
   * HNSW-style navigation graph degree: max neighbors per node.
   * 0 disables the graph (exact brute-force only). Default 16.
   */
  readonly maxNeighbors?: number;
  /**
   * Beam width during greedy graph search (higher → better recall,
   * slower). Default 32.
   */
  readonly efSearch?: number;
  /**
   * Beam width while inserting into the graph. Should be ≥ efSearch
   * for good graph quality. Default 64.
   */
  readonly efConstruction?: number;
  /** PRNG seed for level assignment / tie-breaking. Default 42. */
  readonly seed?: number;
}

export interface EmbeddingHit {
  readonly id: string;
  /** similarity score — metric-dependent; HIGHER is always better. */
  readonly score: number;
}

/** Which path served a query — for recall diagnostics. */
export type EmbeddingSearchPath = 'exact' | 'graph' | 'empty';

export interface EmbeddingSearchResult {
  readonly hits: readonly EmbeddingHit[];
  readonly path: EmbeddingSearchPath;
  /** vectors scored during search (exact = n; graph ≤ ef·layers). */
  readonly scored: number;
}

export interface EmbeddingIndexStats {
  readonly size: number;
  readonly dims: number;
  readonly metric: EmbeddingMetric;
  /** nodes per graph level (level 0 = base layer). */
  readonly levelCounts: readonly number[];
  /** total directed edges stored across all levels. */
  readonly edgeCount: number;
  readonly exactQueries: number;
  readonly graphQueries: number;
}

/* ------------------------------------------------------------------ */
/* Hybrid scoring                                                      */
/* ------------------------------------------------------------------ */

/** One ranked candidate list from a single retriever. */
export interface CandidateList {
  /** provenance for fusion weighting, e.g. 'bm25' | 'vector' */
  readonly source: string;
  readonly hits: readonly EmbeddingHit[];
}

export type FusionMethod =
  /**
   * Reciprocal rank fusion: score(d) = Σ_src w_src / (k + rank_src(d)).
   * Robust to incomparable raw score scales — the standard default.
   */
  | 'rrf'
  /**
   * Weighted min-max blend: normalize each list's scores to [0,1]
   * then score(d) = Σ_src w_src · norm_src(d). Respects magnitude
   * differences when scales are meaningful.
   */
  | 'minmax';

export interface HybridScorerOptions {
  /** Fusion method. Default 'rrf'. */
  readonly method?: FusionMethod;
  /** RRF damping constant. Default 60 (the classic TREC value). */
  readonly rrfK?: number;
  /** per-source weights; absent sources weigh 1. */
  readonly sourceWeights?: Readonly<Record<string, number>>;
  /** output list length cap. Default 10. */
  readonly topN?: number;
}

export interface FusedHit {
  readonly id: string;
  readonly score: number;
  /** per-source fused contribution, for explainability. */
  readonly contributions: Readonly<Record<string, number>>;
  /** best (1-based) rank this id achieved in any input list; 0 = n/a. */
  readonly bestRank: number;
  /** sources that returned this id. */
  readonly sources: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Query embedding cache                                               */
/* ------------------------------------------------------------------ */

export interface SearchClock {
  now(): number;
}

export interface EmbeddingCacheOptions {
  /** max cached embeddings. Default 1024. */
  readonly capacity?: number;
  /** entry TTL in ms; 0 = never expire. Default 0. */
  readonly ttlMs?: number;
  /** vector dim validation (0 = skip). Default 0. */
  readonly dims?: number;
}

export interface EmbeddingCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly expirations: number;
  readonly size: number;
  /** hits / (hits + misses); 0 when no lookups yet. */
  readonly hitRate: number;
}

/* ------------------------------------------------------------------ */
/* Semantic dedup                                                      */
/* ------------------------------------------------------------------ */

export interface SemanticDedupOptions {
  /**
   * Cosine-similarity threshold for near-duplicate membership.
   * Default 0.92 — strict; loose copies (paraphrases) live ~0.8.
   */
  readonly threshold?: number;
  /**
   * MinHash signature size for candidate pruning (0 disables;
   * then dedup falls back to index knn). Default 64.
   */
  readonly signatureSize?: number;
  /**
   * Hamming distance bound on signatures that qualifies a pair for
   * exact-similarity verification. Default = signatureSize/4.
   */
  readonly maxSignatureDistance?: number;
  /** k for the ANN neighbor query used as a second candidate path. */
  readonly candidateK?: number;
}

export interface DuplicateCluster {
  /** cluster id — the canonical member's doc id. */
  readonly canonical: string;
  /** all members including canonical, insertion order. */
  readonly members: readonly string[];
  /** max pairwise similarity observed (1 = identical). */
  readonly maxSimilarity: number;
}

export interface DedupCheck {
  /** true when the new doc lands in an existing cluster. */
  readonly duplicate: boolean;
  /** best-matching existing doc id (undefined when unique). */
  readonly match?: string;
  /** similarity to `match` (0..1). */
  readonly similarity: number;
  /** cluster id the doc joined/would join. */
  readonly cluster?: string;
  /** 'signature' | 'ann' | 'exact' — which path found the match. */
  readonly path: 'signature' | 'ann' | 'exact' | 'none';
}
