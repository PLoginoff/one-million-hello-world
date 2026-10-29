/**
 * Scoring
 *
 * Relevance scoring functions: TF-IDF and BM25, plus vector-space
 * cosine similarity over term-weight vectors.
 */

import { InvertedIndex } from './InvertedIndex';

/**
 * Inverse document frequency: ln(1 + (N - df + 0.5) / (df + 0.5)).
 * Always non-negative for df <= N.
 */
export function idf(totalDocs: number, docFreq: number): number {
  if (docFreq <= 0 || totalDocs <= 0) return 0;
  return Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
}

/**
 * Classic TF-IDF weight: sqrt(tf) * idf.
 */
export function tfIdfWeight(tf: number, totalDocs: number, docFreq: number): number {
  if (tf <= 0) return 0;
  return Math.sqrt(tf) * idf(totalDocs, docFreq);
}

export interface Bm25Params {
  /** term-frequency saturation, typical 1.2 - 2.0 */
  readonly k1: number;
  /** length normalization, typical 0.75 */
  readonly b: number;
}

export const DEFAULT_BM25: Bm25Params = { k1: 1.5, b: 0.75 };

/**
 * BM25 score for a single term in a single document field.
 */
export function bm25TermScore(
  tf: number,
  docFreq: number,
  totalDocs: number,
  docLength: number,
  avgDocLength: number,
  params: Bm25Params = DEFAULT_BM25
): number {
  if (tf <= 0 || docFreq <= 0 || totalDocs <= 0) return 0;
  const idfPart = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  const norm = 1 - params.b + params.b * (avgDocLength > 0 ? docLength / avgDocLength : 0);
  const tfPart = (tf * (params.k1 + 1)) / (tf + params.k1 * norm);
  return idfPart * tfPart;
}

/** Sparse term-weight vector. */
export type TermVector = Map<string, number>;

/** Build a TF-IDF vector for a document's field text using the index stats. */
export function buildTfIdfVector(
  index: InvertedIndex,
  docId: string,
  terms: readonly string[],
  field?: string
): TermVector {
  const total = index.stats().documentCount;
  const vec: TermVector = new Map();
  for (const term of new Set(terms)) {
    const tf = index.termFrequency(term, docId, field);
    const df = index.documentFrequency(term);
    const w = tfIdfWeight(tf, total, df);
    if (w > 0) vec.set(term, w);
  }
  return vec;
}

/** Cosine similarity between two sparse vectors. Returns 0 for empty vectors. */
export function cosineSimilarity(a: TermVector, b: TermVector): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, w] of smaller) {
    normA += w * w;
    const other = larger.get(term);
    if (other !== undefined) dot += w * other;
  }
  for (const w of larger.values()) normB += w * w;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Euclidean distance between sparse vectors (missing dims count as 0). */
export function euclideanDistance(a: TermVector, b: TermVector): number {
  const terms = new Set<string>([...a.keys(), ...b.keys()]);
  let sum = 0;
  for (const t of terms) {
    const d = (a.get(t) ?? 0) - (b.get(t) ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}
