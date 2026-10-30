/**
 * Onboarding Engine2 — Experiment Analyzer (A/B Significance)
 *
 * The flow layer already *assigns* variants deterministically
 * (FlowGraph.assignVariant). Engine2 adds the missing statistical read:
 * did variant B actually beat control A on completion rate?
 *
 * Method: two-proportion z-test on completed/started per variant.
 *   pooled p̂ = (x1+x2)/(n1+n2)
 *   SE       = sqrt(p̂(1-p̂)(1/n1 + 1/n2))
 *   z        = (p̂1 − p̂2) / SE
 * Two-sided p-value from the standard-normal CDF (Abramowitz–Stegun 7.1.26
 * erf approximation, |ε| ≤ 1.5e-7 — no libm dependency).
 *
 * A χ²-style minimum-expected-count guard (expected < 5) flags results as
 * underpowered instead of reporting a misleading "significant".
 *
 * Also ships a deterministic assignment helper (FNV-1a hash → bucket) for
 * EXPERIMENTS DEFINED OUTSIDE the flow definition — e.g. comparing two
 * entirely different flows or email treatments. Stable per (userId, salt).
 *
 * @module OnboardingLayer/Engine2
 */

/** Observed outcomes for one variant arm. */
export interface VariantArm {
  readonly variantId: string;
  readonly started: number;
  readonly completed: number;
}

export interface SignificanceResult {
  readonly control: VariantArm;
  readonly treatment: VariantArm;
  readonly controlRate: number;
  readonly treatmentRate: number;
  /** treatmentRate − controlRate (absolute lift). */
  readonly lift: number;
  /** lift / controlRate; null when control rate is 0. */
  readonly relativeLift: number | null;
  readonly zScore: number;
  /** Two-sided p-value. */
  readonly pValue: number;
  /** p < alpha AND adequately powered. */
  readonly significant: boolean;
  /**
   * True when any expected cell count < 5 — the z approximation is
   * unreliable; callers should keep collecting rather than ship.
   */
  readonly underpowered: boolean;
}

/**
 * Two-proportion z-test comparing completion rates.
 * Throws on empty arms — a test with n=0 in either arm has no answer.
 */
export function compareCompletionRates(
  control: VariantArm,
  treatment: VariantArm,
  alpha = 0.05
): SignificanceResult {
  if (control.started <= 0 || treatment.started <= 0) {
    throw new Error('both arms need at least one started user');
  }
  const p1 = control.completed / control.started;
  const p2 = treatment.completed / treatment.started;
  const pooled = (control.completed + treatment.completed) / (control.started + treatment.started);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.started + 1 / treatment.started));
  const z = se === 0 ? 0 : (p2 - p1) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // χ²-style power check: every expected cell (under pooled p̂) must be ≥ 5.
  const cells = [
    control.started * pooled,
    control.started * (1 - pooled),
    treatment.started * pooled,
    treatment.started * (1 - pooled),
  ];
  const underpowered = cells.some((c) => c < 5);

  return {
    control,
    treatment,
    controlRate: p1,
    treatmentRate: p2,
    lift: p2 - p1,
    relativeLift: p1 === 0 ? null : (p2 - p1) / p1,
    zScore: z,
    pValue,
    significant: !underpowered && pValue < alpha,
    underpowered,
  };
}

/** Standard-normal CDF via A&S 7.1.26 erf approximation (|ε| ≤ 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.319381530 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - phi * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/**
 * FNV-1a 32-bit hash → [0,1) bucket. Same primitive the flow engine uses
 * for variant assignment, extracted here for arbitrary experiments.
 */
export function hashToUnitInterval(userId: string, salt: string): number {
  let h = 0x811c9dc5;
  const s = `${salt}${userId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

export interface ExperimentVariantSpec {
  readonly variantId: string;
  /** Fraction [0,1] of eligible users; weights must sum to ≤ 1. */
  readonly weight: number;
}

/**
 * Assign `userId` to a variant by cumulative-weight buckets, or null for
 * the holdout (weights summing < 1 → remainder sees the default).
 * Deterministic in (userId, salt); order of `variants` defines the cut lines.
 */
export function assignExperimentVariant(
  userId: string,
  variants: readonly ExperimentVariantSpec[],
  salt: string
): string | null {
  const total = variants.reduce((a, v) => a + v.weight, 0);
  if (total > 1 + 1e-9) throw new Error('variant weights must sum to ≤ 1');
  const u = hashToUnitInterval(userId, salt);
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (u < acc) return v.variantId;
  }
  return null;
}

/**
 * Per-variant funnel comparison: conversion at each declared step,
 * treatment vs control, with per-step lift. Cheap diagnostic for "which
 * step regressed" before deciding to kill a variant.
 */
export interface StepConversion {
  readonly stepId: string;
  readonly controlCompleted: number;
  readonly controlEntered: number;
  readonly treatmentCompleted: number;
  readonly treatmentEntered: number;
  readonly lift: number;
}

export function compareStepFunnels(
  controlFunnel: Readonly<Record<string, { entered: number; completed: number }>>,
  treatmentFunnel: Readonly<Record<string, { entered: number; completed: number }>>
): StepConversion[] {
  const out: StepConversion[] = [];
  const stepIds = new Set([...Object.keys(controlFunnel), ...Object.keys(treatmentFunnel)]);
  for (const stepId of stepIds) {
    const c = controlFunnel[stepId] ?? { entered: 0, completed: 0 };
    const t = treatmentFunnel[stepId] ?? { entered: 0, completed: 0 };
    const cr = c.entered === 0 ? 0 : c.completed / c.entered;
    const tr = t.entered === 0 ? 0 : t.completed / t.entered;
    out.push({
      stepId,
      controlCompleted: c.completed,
      controlEntered: c.entered,
      treatmentCompleted: t.completed,
      treatmentEntered: t.entered,
      lift: tr - cr,
    });
  }
  return out.sort((a, b) => a.lift - b.lift); // worst regressions first
}
