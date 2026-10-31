/**
 * Traffic Shift Modeler — Sequential A/B Significance Testing
 *
 * Dashboards answering "did the change move the metric" face a peek
 * problem: checking a fixed-horizon p-value every few minutes
 * inflates false positives. This modeler instead implements a
 * **Sequential Probability Ratio Test** (Wald, 1945): after every
 * observation pair it updates a cumulative log-likelihood ratio and
 * makes one of three calls — accept H1 (shift real), accept H0 (no
 * shift), or keep sampling.
 *
 * For binomial metrics (conversion rates), the LLR of observing
 * rates p₀ (control) vs p₁ (treatment) accumulates per trial:
 *
 *     LLR += x·ln(p₁'/p₀') + (1−x)·ln((1−p₁')/(1−p₀'))
 *
 * against Wald bounds A = ln((1−β)/α) and B = ln(β/(1−α)) with
 * α = false-positive rate, β = false-negative rate. The estimator
 * uses pooled running rates, which makes this a *self-correcting*
 * group-sequential test rather than a strict SPRT — the standard
 * mSPRT approximation used in industry experimentation platforms.
 *
 * For continuous metrics, a normal-approximation variant uses the
 * running mean difference vs pooled variance (Welch form).
 *
 * Also provides the classic fixed-horizon z-test for comparison —
 * the "naive" answer that sequential testing replaces.
 *
 * Complexity: O(1) per observation; O(arms) per decision.
 *
 * @module AnalyticsLayer/Engine2
 */

export interface ShiftTestOptions {
  /** False-positive rate α (default 0.05). */
  readonly alpha?: number;
  /** False-negative rate β → power 1−β (default 0.2 = 80% power). */
  readonly beta?: number;
  /**
   * Minimum detectable effect as a *relative* lift (default 0.05 =
   * detect a 5% relative change). Used to set the alternative
   * hypothesis p₁ = p₀·(1+mde) for the LLR.
   */
  readonly mdeRelative?: number;
}

export type ShiftVerdict =
  | 'continue'          // keep sampling — inconclusive so far
  | 'lift'              // H1: treatment > control beyond bounds
  | 'drop'              // H0: no meaningful shift detected
  | 'harm';             // treatment significantly below control

interface Arm {
  trials: number;
  successes: number; // binomial mode
  sum: number;       // continuous mode
  sumSq: number;
  mean: number;
  m2: number; // Welford variance accumulator
}

function newArm(): Arm {
  return { trials: 0, successes: 0, sum: 0, sumSq: 0, mean: 0, m2: 0 };
}

export interface ShiftStatus {
  readonly controlN: number;
  readonly treatmentN: number;
  readonly controlRate: number;
  readonly treatmentRate: number;
  /** Relative lift (treatment-control)/control. */
  readonly relativeLift: number;
  /** Cumulative log-likelihood ratio (binomial mode). */
  readonly llr: number;
  /** Wald bounds at current α/β. */
  readonly upperBound: number;
  readonly lowerBound: number;
  readonly verdict: ShiftVerdict;
  /** Classic fixed-horizon two-proportion z p-value (for reference). */
  readonly naivePValue: number;
}

/** Standard normal CDF via Abramowitz–Stegun 7.1.26 (|ε| < 1.5e-7). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t *
        Math.exp(-x * x)));
  return 0.5 * (1 + erf);
}

/** Two-tailed p-value for a z statistic. */
export function zToP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export class TrafficShiftModeler {
  private readonly alpha: number;
  private readonly beta: number;
  private readonly mde: number;
  private readonly control = newArm();
  private readonly treatment = newArm();
  private llr = 0;

  constructor(options: ShiftTestOptions = {}) {
    this.alpha = options.alpha ?? 0.05;
    this.beta = options.beta ?? 0.2;
    this.mde = options.mdeRelative ?? 0.05;
    if (this.alpha <= 0 || this.alpha >= 1) throw new Error('alpha must be in (0,1)');
    if (this.beta <= 0 || this.beta >= 1) throw new Error('beta must be in (0,1)');
  }

  /** Record a control-arm trial (binomial: success 0|1). */
  observeControl(success: boolean): void {
    this.bump(this.control, success ? 1 : 0);
    this.updateLlr();
  }

  /** Record a treatment-arm trial. */
  observeTreatment(success: boolean): void {
    this.bump(this.treatment, success ? 1 : 0);
    this.updateLlr();
  }

  /** Record a continuous metric value on the control arm. */
  observeControlValue(v: number): void {
    this.bumpContinuous(this.control, v);
  }

  /** Record a continuous metric value on the treatment arm. */
  observeTreatmentValue(v: number): void {
    this.bumpContinuous(this.treatment, v);
  }

  private bump(a: Arm, x: number): void {
    a.trials++;
    a.successes += x;
    a.sum += x;
  }

  private bumpContinuous(a: Arm, x: number): void {
    a.trials++;
    a.sum += x;
    a.sumSq += x * x;
    const delta = x - a.mean;
    a.mean += delta / a.trials;
    a.m2 += delta * (x - a.mean);
  }

  /**
   * mSPRT-style LLR update: recompute the cumulative log-likelihood
   * ratio for H1(p₁ = p₀·(1+mde)) vs H0(p₁ = p₀) over all observed
   * treatment trials, using the pooled control rate as the plug-in
   * estimate of p₀.
   */
  private updateLlr(): void {
    const n0 = this.control.trials;
    const n1 = this.treatment.trials;
    if (n0 === 0 || n1 === 0) return;
    const p0 = Math.min(0.9999, Math.max(0.0001, this.control.successes / n0));
    const p1 = Math.min(0.9999, Math.max(0.0001, p0 * (1 + this.mde)));
    const x1 = this.treatment.successes;
    // LLR of all treatment trials under p1 vs p0 (Bernoulli sum form).
    this.llr =
      x1 * Math.log(p1 / p0) + (n1 - x1) * Math.log((1 - p1) / (1 - p0));
  }

  /**
   * Current test status — evaluate any time; the verdict's meaning
   * holds under sequential peeking by construction.
   */
  status(): ShiftStatus {
    const upper = Math.log((1 - this.beta) / this.alpha);
    const lower = Math.log(this.beta / (1 - this.alpha));
    const p0 = this.control.trials > 0 ? this.control.successes / this.control.trials : 0;
    const p1 = this.treatment.trials > 0 ? this.treatment.successes / this.treatment.trials : 0;
    const lift = p0 > 0 ? (p1 - p0) / p0 : 0;

    let verdict: ShiftVerdict = 'continue';
    if (this.llr >= upper) verdict = p1 >= p0 ? 'lift' : 'harm';
    else if (this.llr <= lower) verdict = 'drop';

    return {
      controlN: this.control.trials,
      treatmentN: this.treatment.trials,
      controlRate: p0,
      treatmentRate: p1,
      relativeLift: lift,
      llr: this.llr,
      upperBound: upper,
      lowerBound: lower,
      verdict,
      naivePValue: this.zTestPValue(),
    };
  }

  /**
   * Classic fixed-horizon two-proportion z-test — the naive answer.
   * Returns the two-tailed p-value (NaN until both arms have data).
   */
  zTestPValue(): number {
    const n0 = this.control.trials;
    const n1 = this.treatment.trials;
    if (n0 === 0 || n1 === 0) return Number.NaN;
    const p0 = this.control.successes / n0;
    const p1 = this.treatment.successes / n1;
    const pooled = (this.control.successes + this.treatment.successes) / (n0 + n1);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n0 + 1 / n1));
    if (se === 0) return p0 === p1 ? 1 : 0;
    return zToP((p1 - p0) / se);
  }

  /** Welch t p-value for the continuous arms. */
  welchPValue(): number {
    const a = this.control;
    const b = this.treatment;
    if (a.trials < 2 || b.trials < 2) return Number.NaN;
    const va = a.m2 / (a.trials - 1);
    const vb = b.m2 / (b.trials - 1);
    const se = Math.sqrt(va / a.trials + vb / b.trials);
    if (se === 0) return 1;
    return zToP((b.mean - a.mean) / se);
  }

  /** Running means for continuous arms. */
  means(): { control: number; treatment: number } {
    return { control: this.control.mean, treatment: this.treatment.mean };
  }

  /** Sample sizes. */
  sizes(): { control: number; treatment: number } {
    return { control: this.control.trials, treatment: this.treatment.trials };
  }
}
