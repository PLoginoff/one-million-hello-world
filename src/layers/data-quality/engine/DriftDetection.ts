/**
 * Data Drift Detection & Cross-Table Reconciliation
 *
 * Two complementary toolkits:
 *
 * DriftDetection
 * --------------
 * Compares a reference (baseline) column distribution against a current
 * batch and quantifies drift:
 *
 *   - Numeric: Kolmogorov–Smirnov statistic (max |F1−F2| over the
 *     empirical CDFs — O(n log n) sort + O(n) sweep), plus mean/stddev
 *     shift in units of baseline σ.
 *   - Categorical: Population Stability Index (PSI) —
 *     Σ (p_i − q_i)·ln(p_i/q_i) over buckets; the industry-standard
 *     drift score (PSI < 0.1 stable, 0.1–0.25 moderate, > 0.25 drifted).
 *   - Jensen–Shannon divergence for categorical distributions as a
 *     bounded (0–1) alternative to PSI.
 *
 * Reconciliation
 * --------------
 * Set-join comparison between two row collections (e.g. source vs.
 * warehouse copies): reports rows missing on either side and field-level
 * mismatches for shared keys — the "did the load lose/mangle rows?"
 * check.
 *
 * @module DataQuality/Engine
 */

import { DQRow } from './QualityRules';

/* ------------------------------------------------------------------------ */
/* Numeric drift — KS statistic                                             */
/* ------------------------------------------------------------------------ */

/** Result of a numeric drift comparison. */
export interface NumericDrift {
  /** Kolmogorov–Smirnov statistic ∈ [0,1]; larger = more drift. */
  readonly ksStatistic: number;
  /** Approximate p-value via the asymptotic Kolmogorov distribution. */
  readonly pValue: number;
  /** Mean shift in units of baseline stddev. */
  readonly meanShiftSigma: number;
  readonly referenceMean: number;
  readonly currentMean: number;
  readonly referenceStddev: number;
  readonly currentStddev: number;
  /** Drift verdict at `alpha` significance. */
  readonly drifted: boolean;
}

/**
 * Two-sample Kolmogorov–Smirnov test.
 *
 * D = max_x |F_ref(x) − F_cur(x)| over the pooled sorted sample.
 * The p-value uses the Kolmogorov asymptotic approximation
 *   Q(λ) = 2·Σ (−1)^(k−1)·e^(−2k²λ²),  λ = D·√(n·m/(n+m))
 * truncated at k=100 — adequate for drift alarms, not for publication.
 */
export function ksTest(reference: readonly number[], current: readonly number[], alpha = 0.05): NumericDrift {
  const a = reference.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  const b = current.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (a.length === 0 || b.length === 0) {
    throw new Error('KS test needs non-empty samples');
  }
  let d = 0;
  let i = 0;
  let j = 0;
  // Sweep the merged order accumulating CDF difference. O(n+m).
  while (i < a.length || j < b.length) {
    const x = j >= b.length || (i < a.length && a[i] <= b[j]) ? a[i] : b[j];
    // Advance both samples past x — equal values move both CDFs, which
    // keeps D = 0 for identical samples.
    while (i < a.length && a[i] <= x) i++;
    while (j < b.length && b[j] <= x) j++;
    const diff = Math.abs(i / a.length - j / b.length);
    if (diff > d) d = diff;
  }
  const lambda = d * Math.sqrt((a.length * b.length) / (a.length + b.length));
  // Kolmogorov Q(λ) is numerically unstable for λ < ~0.28 (alternating
  // series degenerates); treat tiny λ as "cannot reject" → p = 1.
  let p = 1;
  if (lambda > 1e-10) {
    let q = 0;
    for (let k = 1; k <= 100; k++) {
      const term = 2 * (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
      q += term;
      if (Math.abs(term) < 1e-8) break; // converged
    }
    p = Math.max(0, Math.min(1, q));
  }

  const stats = (xs: readonly number[]): { mean: number; sd: number } => {
    let m = 0;
    let m2 = 0;
    for (let t = 0; t < xs.length; t++) {
      const delta = xs[t] - m;
      m += delta / (t + 1);
      m2 += delta * (xs[t] - m);
    }
    return { mean: m, sd: xs.length < 2 ? 0 : Math.sqrt(m2 / xs.length) };
  };
  const rs = stats(a);
  const cs = stats(b);
  const shift = rs.sd === 0 ? 0 : Math.abs(cs.mean - rs.mean) / rs.sd;

  return {
    ksStatistic: d,
    pValue: p,
    meanShiftSigma: shift,
    referenceMean: rs.mean,
    currentMean: cs.mean,
    referenceStddev: rs.sd,
    currentStddev: cs.sd,
    drifted: p < alpha,
  };
}

/* ------------------------------------------------------------------------ */
/* Categorical drift — PSI & JS divergence                                  */
/* ------------------------------------------------------------------------ */

/** Per-bucket PSI contribution + totals. */
export interface PsiResult {
  readonly psi: number;
  readonly buckets: Array<{ bucket: string; referencePct: number; currentPct: number; contribution: number }>;
  readonly verdict: 'stable' | 'moderate' | 'drifted';
}

const EPS = 1e-6; // smoothing to avoid log(0)

/**
 * Population Stability Index over categorical (or pre-bucketed numeric)
 * values. `bucketize` maps a raw value to a bucket label.
 */
export function psi<T>(reference: readonly T[], current: readonly T[], bucketize: (v: T) => string): PsiResult {
  const refDist = distribution(reference, bucketize);
  const curDist = distribution(current, bucketize);
  const buckets = new Set([...refDist.keys(), ...curDist.keys()]);
  let total = 0;
  const details: PsiResult['buckets'] = [];
  for (const b of buckets) {
    const rp = (refDist.get(b) ?? 0) + EPS;
    const cp = (curDist.get(b) ?? 0) + EPS;
    // Normalize after smoothing.
    const contribution = (cp - rp) * Math.log(cp / rp);
    total += contribution;
    details.push({ bucket: b, referencePct: rp, currentPct: cp, contribution });
  }
  const verdict = total < 0.1 ? 'stable' : total < 0.25 ? 'moderate' : 'drifted';
  return { psi: total, buckets: details, verdict };
}

function distribution<T>(values: readonly T[], bucketize: (v: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const b = bucketize(v);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const n = values.length || 1;
  const dist = new Map<string, number>();
  for (const [k, c] of counts) dist.set(k, c / n);
  return dist;
}

/**
 * Jensen–Shannon divergence between two categorical distributions.
 * Bounded [0, ln2 ≈ 0.693]; we normalize to [0,1]. Symmetric and always
 * finite, unlike KL — good for dashboards.
 */
export function jsDivergence<T>(reference: readonly T[], current: readonly T[], bucketize: (v: T) => string): number {
  const p = distribution(reference, bucketize);
  const q = distribution(current, bucketize);
  const buckets = new Set([...p.keys(), ...q.keys()]);
  const m = new Map<string, number>();
  for (const b of buckets) m.set(b, ((p.get(b) ?? 0) + (q.get(b) ?? 0)) / 2);
  const kl = (a: Map<string, number>, b: Map<string, number>): number => {
    let s = 0;
    for (const k of buckets) {
      const av = a.get(k) ?? 0;
      if (av === 0) continue;
      s += av * Math.log(av / (b.get(k) ?? EPS));
    }
    return s;
  };
  const js = (kl(p, m) + kl(q, m)) / 2;
  return js / Math.LN2; // normalize to [0,1]
}

/* ------------------------------------------------------------------------ */
/* Reconciliation                                                           */
/* ------------------------------------------------------------------------ */

/** A field-level difference on a shared key. */
export interface FieldMismatch {
  readonly key: string;
  readonly field: string;
  readonly leftValue: unknown;
  readonly rightValue: unknown;
}

/** Reconciliation outcome. */
export interface ReconciliationReport {
  readonly leftCount: number;
  readonly rightCount: number;
  readonly matchedKeys: number;
  /** Keys only in the left (source) collection. */
  readonly missingOnRight: string[];
  /** Keys only in the right (target) collection. */
  readonly missingOnLeft: string[];
  /** Shared keys with differing field values. */
  readonly fieldMismatches: FieldMismatch[];
  readonly reconciled: boolean;
}

/**
 * Compare two collections by key.
 *
 * Hash join semantics: index right side by key (O(m)), probe each left
 * row (O(n)); leftover right keys are missing-on-left. Shared keys diff
 * field-by-field over the union of their fields.
 */
export function reconcile(
  left: readonly DQRow[],
  right: readonly DQRow[],
  keyOf: (row: DQRow) => string,
  opts: { ignoreFields?: readonly string[]; maxMismatches?: number } = {}
): ReconciliationReport {
  const ignore = new Set(opts.ignoreFields ?? []);
  const maxMismatches = opts.maxMismatches ?? 1000;
  const rightIndex = new Map<string, DQRow>();
  for (const r of right) rightIndex.set(keyOf(r), r);
  const seenRight = new Set<string>();
  const missingOnRight: string[] = [];
  const mismatches: FieldMismatch[] = [];
  let matched = 0;

  for (const l of left) {
    const k = keyOf(l);
    const r = rightIndex.get(k);
    if (r === undefined) {
      missingOnRight.push(k);
      continue;
    }
    seenRight.add(k);
    matched++;
    if (mismatches.length < maxMismatches) {
      const fields = new Set([...Object.keys(l), ...Object.keys(r)]);
      for (const f of fields) {
        if (ignore.has(f)) continue;
        const lv = l[f];
        const rv = r[f];
        if (!valuesEqual(lv, rv)) {
          mismatches.push({ key: k, field: f, leftValue: lv, rightValue: rv });
          if (mismatches.length >= maxMismatches) break;
        }
      }
    }
  }
  const missingOnLeft: string[] = [];
  for (const r of right) {
    const k = keyOf(r);
    if (!seenRight.has(k)) missingOnLeft.push(k);
  }
  return {
    leftCount: left.length,
    rightCount: right.length,
    matchedKeys: matched,
    missingOnRight,
    missingOnLeft,
    fieldMismatches: mismatches,
    reconciled: missingOnRight.length === 0 && missingOnLeft.length === 0 && mismatches.length === 0,
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    // Float tolerance: exact equality is too brittle for computed cols.
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (a === null || b === null) return a === b;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/* ------------------------------------------------------------------------ */
/* Convenience batch API                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Compare two row batches column-by-column: numeric columns get a KS
 * test, others get PSI. One call = a full drift report.
 */
export function driftReport(
  reference: readonly DQRow[],
  current: readonly DQRow[],
  columns: readonly string[]
): Array<{ column: string; kind: 'numeric' | 'categorical'; numeric?: NumericDrift; psi?: PsiResult }> {
  const out: Array<{ column: string; kind: 'numeric' | 'categorical'; numeric?: NumericDrift; psi?: PsiResult }> = [];
  for (const col of columns) {
    const refVals = reference.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    const curVals = current.map((r) => r[col]).filter((v) => v !== null && v !== undefined);
    const isNumeric = refVals.length > 0 && refVals.every((v) => typeof v === 'number');
    if (isNumeric) {
      out.push({ column: col, kind: 'numeric', numeric: ksTest(refVals as number[], curVals as number[]) });
    } else {
      const p = psi(refVals, curVals, (v) => String(v));
      out.push({ column: col, kind: 'categorical', psi: p });
    }
  }
  return out;
}
