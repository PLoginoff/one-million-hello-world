/**
 * Risk-Based / Adaptive MFA
 *
 * Computes a continuous risk score for an authentication attempt from
 * weighted signals (new device, impossible travel, unusual hour, IP
 * reputation, failed attempts) and decides whether to:
 *
 *   - ALLOW   — score < lowThreshold, no MFA needed
 *   - STEP_UP — score in [low, high): require one MFA factor
 *   - DENY    — score >= highThreshold: block outright
 *
 * Signal weights and thresholds are configurable. The scorer is a linear
 * model (weighted sum, clamped to [0,100]) — interpretable and cheap,
 * O(#signals). Each `RiskSignal` contributes additively; missing signals
 * contribute 0.
 *
 * @module Mfa/Engine2
 */

/** Context signals for one authentication attempt. */
export interface RiskContext {
  /** Device fingerprint seen before for this user? */
  readonly knownDevice: boolean;
  /** Minutes since last successful auth from a different geolocation
   *  that would require > 900 km/h travel. Infinity if first auth. */
  readonly impossibleTravel: boolean;
  /** Hour of day (0-23) at attempt time, in the user's usual timezone. */
  readonly hourOfDay: number;
  /** Hours during which the user normally authenticates (e.g. [8,20]). */
  readonly usualHours?: readonly [number, number];
  /** IP reputation 0..1 (0 = clean, 1 = known bad). */
  readonly ipReputation?: number;
  /** Failed auth attempts in the last hour for this account. */
  readonly recentFailures?: number;
  /** Whether the source network is the corporate network. */
  readonly corporateNetwork?: boolean;
  /** Whether the account was recently recovered/password-reset. */
  readonly recentAccountRecovery?: boolean;
  /** Sensitivity of the action being attempted. */
  readonly actionSensitivity?: 'low' | 'medium' | 'high';
}

/** Configurable weights — all in "risk points" added to the score. */
export interface RiskWeights {
  readonly unknownDevice: number;
  readonly impossibleTravel: number;
  readonly unusualHour: number;
  readonly badIpReputation: number; // multiplied by ipReputation
  readonly recentFailure: number;   // per failure
  readonly offNetwork: number;
  readonly recentRecovery: number;
  readonly actionSensitivity: { readonly low: number; readonly medium: number; readonly high: number };
}

export const DEFAULT_WEIGHTS: RiskWeights = {
  unknownDevice: 35,
  impossibleTravel: 35,
  unusualHour: 10,
  badIpReputation: 40,
  recentFailure: 8,
  offNetwork: 10,
  recentRecovery: 15,
  actionSensitivity: { low: 0, medium: 10, high: 20 },
};

export type RiskDecision = 'allow' | 'step-up' | 'deny';

export interface RiskAssessment {
  readonly score: number; // 0..100
  readonly decision: RiskDecision;
  /** Which signals fired — explains the score. */
  readonly contributions: readonly SignalContribution[];
}

export interface SignalContribution {
  readonly signal: string;
  readonly points: number;
  readonly detail: string;
}

export interface RiskPolicy {
  /** Below this → allow without MFA. Default 30. */
  readonly lowThreshold?: number;
  /** At or above this → deny. Default 80. */
  readonly highThreshold?: number;
  readonly weights?: Partial<RiskWeights>;
}

export class RiskScorer {
  private readonly low: number;
  private readonly high: number;
  private readonly w: RiskWeights;

  constructor(policy: RiskPolicy = {}) {
    this.low = policy.lowThreshold ?? 30;
    this.high = policy.highThreshold ?? 80;
    this.w = { ...DEFAULT_WEIGHTS, ...(policy.weights ?? {}) };
  }

  /** Score one attempt. O(#signals). */
  assess(ctx: RiskContext): RiskAssessment {
    const contributions: SignalContribution[] = [];
    let score = 0;
    const add = (signal: string, points: number, detail: string) => {
      if (points > 0) {
        score += points;
        contributions.push({ signal, points, detail });
      }
    };

    if (!ctx.knownDevice) {
      add('unknown-device', this.w.unknownDevice, 'device fingerprint not recognised');
    }
    if (ctx.impossibleTravel) {
      add('impossible-travel', this.w.impossibleTravel, 'geographically impossible travel detected');
    }
    const [lo, hi] = ctx.usualHours ?? [6, 22];
    if (ctx.hourOfDay < lo || ctx.hourOfDay > hi) {
      add('unusual-hour', this.w.unusualHour, `auth at ${ctx.hourOfDay}:00 outside ${lo}:00–${hi}:00`);
    }
    if (ctx.ipReputation !== undefined && ctx.ipReputation > 0) {
      add('ip-reputation', ctx.ipReputation * this.w.badIpReputation, `IP reputation ${ctx.ipReputation.toFixed(2)}`);
    }
    const failures = ctx.recentFailures ?? 0;
    if (failures > 0) {
      add('recent-failures', failures * this.w.recentFailure, `${failures} recent failed attempts`);
    }
    if (ctx.corporateNetwork === false) {
      add('off-network', this.w.offNetwork, 'not on corporate network');
    }
    if (ctx.recentAccountRecovery) {
      add('recent-recovery', this.w.recentRecovery, 'recent account recovery');
    }
    const sens = ctx.actionSensitivity ?? 'low';
    add('action-sensitivity', this.w.actionSensitivity[sens], `action sensitivity ${sens}`);

    const clamped = Math.min(100, Math.max(0, score));
    const decision: RiskDecision = clamped >= this.high ? 'deny' : clamped >= this.low ? 'step-up' : 'allow';
    return { score: clamped, decision, contributions };
  }
}

/**
 * Step-up orchestrator: given an assessment and the user's enrolled
 * factors, picks the factor to challenge. Prefers phishing-resistant
 * factors for high-sensitivity actions.
 */
export class StepUpDecider {
  constructor(
    private readonly preferredOrder: readonly string[] = ['webauthn', 'totp', 'sms']
  ) {}

  /**
   * Choose which factor to challenge with.
   * Returns null when the user has no usable factor (caller must deny or
   * fall back to enrolment).
   */
  chooseFactor(
    enrolled: readonly string[],
    assessment: RiskAssessment
  ): string | null {
    if (assessment.decision === 'allow') return null;
    for (const f of this.preferredOrder) {
      if (enrolled.includes(f)) return f;
    }
    return enrolled.length > 0 ? enrolled[0] : null;
  }

  /**
   * True when a second distinct factor should be required — e.g. very
   * high score but below deny, or high-sensitivity action with elevated
   * score. Caller decides the threshold.
   */
  requiresSecondFactor(assessment: RiskAssessment, secondFactorScore = 60): boolean {
    return assessment.decision === 'step-up' && assessment.score >= secondFactorScore;
  }
}
