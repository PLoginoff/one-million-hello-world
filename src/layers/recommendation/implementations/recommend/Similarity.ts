/**
 * Similarity
 *
 * Vector similarity functions over sparse rating/feature vectors,
 * used by collaborative and content-based recommenders.
 */

export type SparseVector = ReadonlyMap<string, number>;

/** Cosine similarity between sparse vectors. 0 for empty/disjoint. */
export function cosineSim(a: SparseVector, b: SparseVector): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  let normA = 0;
  for (const [k, v] of small) {
    normA += v * v;
    const other = large.get(k);
    if (other !== undefined) dot += v * other;
  }
  let normB = 0;
  for (const v of large.values()) normB += v * v;
  // normA was computed only for the smaller map — but norm must be over all of `a`.
  normA = 0;
  for (const v of a.values()) normA += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Pearson correlation over common keys, mean-centered.
 * Returns 0 when there are fewer than `minOverlap` shared keys.
 */
export function pearsonSim(a: SparseVector, b: SparseVector, minOverlap = 2): number {
  const common: string[] = [];
  for (const k of a.keys()) {
    if (b.has(k)) common.push(k);
  }
  if (common.length < minOverlap) return 0;
  let sumA = 0;
  let sumB = 0;
  for (const k of common) {
    sumA += a.get(k) ?? 0;
    sumB += b.get(k) ?? 0;
  }
  const meanA = sumA / common.length;
  const meanB = sumB / common.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const k of common) {
    const da = (a.get(k) ?? 0) - meanA;
    const db = (b.get(k) ?? 0) - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 0;
  return num / (Math.sqrt(denA) * Math.sqrt(denB));
}

/**
 * Adjusted cosine similarity (item-based CF): subtract each user's mean
 * before computing cosine. More robust to rating-scale differences.
 */
export function adjustedCosineSim(
  itemA: SparseVector,
  itemB: SparseVector,
  userMeans: SparseVector
): number {
  const commonUsers: string[] = [];
  for (const u of itemA.keys()) {
    if (itemB.has(u)) commonUsers.push(u);
  }
  if (commonUsers.length === 0) return 0;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const u of commonUsers) {
    const mean = userMeans.get(u) ?? 0;
    const da = (itemA.get(u) ?? 0) - mean;
    const db = (itemB.get(u) ?? 0) - mean;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 0;
  return num / (Math.sqrt(denA) * Math.sqrt(denB));
}

/** Jaccard similarity over key sets (implicit-feedback data). */
export function jaccardSim(a: SparseVector, b: SparseVector): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const k of a.keys()) if (b.has(k)) inter++;
  return inter / (a.size + b.size - inter);
}
