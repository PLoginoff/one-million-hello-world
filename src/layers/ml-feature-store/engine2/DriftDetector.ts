/**
 * Feature Drift Detector — distribution shift per feature.
 *
 * Two complementary statistics:
 *
 *   PSI (Population Stability Index) — binned comparison of reference
 *   vs current histograms:
 *       PSI = Σ (cur% - ref%) · ln(cur% / ref%)
 *   Conventional thresholds: <0.1 stable, 0.1-0.25 moderate, >0.25 shift.
 *   Bins are quantile-derived from the reference so empty-bin artefacts
 *   don't dominate.
 *
 *   KS (Kolmogorov–Smirnov) — max gap between empirical CDFs; O(n log n)
 *   via sorting. Catches shape changes PSI's fixed bins can miss.
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { DriftResult, FeatureWindow } from './types';

const PSI_BINS = 10;
const EPS = 1e-6;

/**
 * PSI between a reference and current sample, using quantile bins from
 * the reference. `bins` bucket boundaries derived once — reusing them
 * across windows keeps repeated checks comparable.
 */
export function psi(reference: ReadonlyArray<number>, current: ReadonlyArray<number>, bins = PSI_BINS): number {
  if (reference.length === 0 || current.length === 0) return 0;
  const edges = quantileEdges(reference, bins);
  const refHist = histogram(reference, edges);
  const curHist = histogram(current, edges);
  let sum = 0;
  for (let i = 0; i < refHist.length; i++) {
    const r = Math.max(refHist[i] / reference.length, EPS);
    const c = Math.max(curHist[i] / current.length, EPS);
    sum += (c - r) * Math.log(c / r);
  }
  return sum;
}

/** Kolmogorov–Smirnov D-statistic: max |F_ref(x) - F_cur(x)|. */
export function ks(reference: ReadonlyArray<number>, current: ReadonlyArray<number>): number {
  if (reference.length === 0 || current.length === 0) return 0;
  const a = [...reference].sort((x, y) => x - y);
  const b = [...current].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let d = 0;
  while (i < a.length && j < b.length) {
    // Ties advance both CDFs together — advancing one on a tie would
    // fabricate a gap that isn't in the data.
    if (a[i] < b[j]) i += 1;
    else if (b[j] < a[i]) j += 1;
    else {
      i += 1;
      j += 1;
    }
    d = Math.max(d, Math.abs(i / a.length - j / b.length));
  }
  // Drain whichever remains (final CDF gap).
  d = Math.max(d, Math.abs(i / a.length - j / b.length));
  return d;
}

export class DriftDetector {
  private readonly _psiThreshold: number;
  private readonly _ksThreshold: number;
  /** feature → reference samples (training-time distribution). */
  private readonly _reference = new Map<string, number[]>();

  constructor(opts: { psiThreshold?: number; ksThreshold?: number } = {}) {
    this._psiThreshold = opts.psiThreshold ?? 0.25;
    this._ksThreshold = opts.ksThreshold ?? 0.1;
  }

  /** Record the reference (expected) distribution for a feature. */
  setReference(feature: string, samples: ReadonlyArray<number>): void {
    this._reference.set(feature, [...samples]);
  }

  /**
   * Evaluate a current window against the stored reference.
   * `method` picks the statistic; 'psi' is the default for tabular
   * features, 'ks' for heavy-tailed ones.
   */
  evaluate(window: FeatureWindow, method: 'psi' | 'ks' = 'psi'): DriftResult {
    const ref = this._reference.get(window.feature) ?? window.reference;
    const stat =
      method === 'psi'
        ? psi(ref, window.current)
        : ks(ref, window.current);
    const threshold = method === 'psi' ? this._psiThreshold : this._ksThreshold;
    return {
      feature: window.feature,
      method,
      statistic: stat,
      drifted: stat >= threshold,
      threshold,
      referenceCount: ref.length,
      currentCount: window.current.length,
    };
  }

  /** Evaluate many features in one pass; returns only drifted ones. */
  driftedFeatures(windows: ReadonlyArray<FeatureWindow>, method: 'psi' | 'ks' = 'psi'): DriftResult[] {
    return windows
      .map((w) => this.evaluate(w, method))
      .filter((r) => r.drifted);
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Quantile bin edges from a sorted copy of `samples`. */
function quantileEdges(samples: ReadonlyArray<number>, bins: number): number[] {
  const s = [...samples].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 1; i < bins; i++) {
    const idx = Math.floor((i / bins) * (s.length - 1));
    edges.push(s[idx]);
  }
  return edges;
}

/** Count samples per bin defined by `edges` (edges.length + 1 bins). */
function histogram(samples: ReadonlyArray<number>, edges: ReadonlyArray<number>): number[] {
  const counts = new Array<number>(edges.length + 1).fill(0);
  for (const v of samples) {
    let lo = 0;
    let hi = edges.length;
    // Binary search for the first edge > v.
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v < edges[mid]) hi = mid;
      else lo = mid + 1;
    }
    counts[lo] += 1;
  }
  return counts;
}
