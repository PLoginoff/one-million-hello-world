/**
 * MFA Orchestrator — the end-to-end decision flow.
 *
 * Composes policy → risk → trusted-device → factor selection into the
 * single call an application makes on each authentication:
 *
 *   1. Look up the MFA policy for (user, action, resource).
 *   2. If the caller presents a valid trusted-device token that satisfies
 *      the policy, skip the challenge entirely (device trust counts as
 *      a satisfied factor of class 'device').
 *   3. Compute the risk score; on 'deny', fail closed.
 *   4. On 'step-up' or a required policy, pick the factor to challenge
 *      via StepUpDecider (webauthn > totp > sms) — honouring the policy's
 *      factor set.
 *   5. Return a `MfaPlan` — what the caller should challenge with and
 *      why.
 *
 * This is the seam where the four engine2 pieces integrate.
 *
 * @module Mfa/Engine2
 */

import { MfaPolicyEngine, PolicyRequest, AssertedFactor, PolicyDecision } from './MfaPolicy';
import { RiskScorer, RiskContext, RiskAssessment, StepUpDecider } from './RiskBasedMfa';
import { TrustedDeviceStore } from './TrustedDevice';
import { WebAuthnCeremony } from './WebAuthn';

export interface MfaPlan {
  /** What the caller should do next. */
  readonly action: 'allow' | 'deny' | 'challenge';
  /** Factor to challenge with (when action='challenge'). */
  readonly factor?: string;
  /** Whether a second factor is required after the first succeeds. */
  readonly secondFactorRequired: boolean;
  readonly policy: PolicyDecision;
  readonly risk: RiskAssessment;
  /** Why this plan was produced — human readable. */
  readonly reason: string;
  /** Trusted-device token the caller may set (post-challenge cookie). */
  readonly issuedDeviceToken?: string;
}

export interface AuthAttempt {
  readonly user: string;
  readonly action: string;
  readonly resource?: string;
  readonly groups?: readonly string[];
  readonly deviceId?: string;
  /** Presented trusted-device token string, if any. */
  readonly deviceToken?: string;
  /** Factors already asserted this session (e.g. from primary auth). */
  readonly asserted?: readonly AssertedFactor[];
  readonly risk: RiskContext;
}

export class MfaOrchestrator {
  constructor(
    private readonly policy: MfaPolicyEngine,
    private readonly scorer: RiskScorer,
    private readonly devices: TrustedDeviceStore,
    private readonly decider: StepUpDecider = new StepUpDecider(),
    private readonly webauthn?: WebAuthnCeremony,
    private readonly enrolledFactors: readonly string[] = ['webauthn', 'totp']
  ) {}

  /**
   * Evaluate an auth attempt → a plan. Never throws; deny-on-error is
   * the caller's policy decision.
   */
  plan(attempt: AuthAttempt): MfaPlan {
    // 1. Risk gate first — deny short-circuits everything.
    const risk = this.scorer.assess(attempt.risk);
    const policyReq: PolicyRequest = {
      user: attempt.user,
      action: attempt.action,
      resource: attempt.resource,
      groups: attempt.groups,
    };
    const decision = this.policy.evaluate(policyReq);

    if (risk.decision === 'deny') {
      return {
        action: 'deny',
        secondFactorRequired: false,
        policy: decision,
        risk,
        reason: `risk score ${risk.score.toFixed(0)} ≥ deny threshold`,
      };
    }

    // 2. Trusted device satisfies 'device'-class requirements and can
    //    downgrade step-up when policy allows.
    if (attempt.deviceToken) {
      const ok = this.devices.validate(attempt.deviceToken);
      if (ok && this.deviceSatisfies(ok.deviceId, decision, attempt)) {
        return {
          action: 'allow',
          secondFactorRequired: false,
          policy: decision,
          risk,
          reason: 'trusted device token satisfied MFA requirement',
        };
      }
    }

    // 3. Policy says no MFA and risk says allow → allow.
    if (!decision.required && risk.decision === 'allow') {
      return {
        action: 'allow',
        secondFactorRequired: false,
        policy: decision,
        risk,
        reason: 'no MFA required; low risk',
      };
    }

    // 4. Check whether already-asserted factors satisfy the requirement.
    const sat = this.policy.satisfies(decision, attempt.asserted ?? []);
    if (sat.ok && risk.decision === 'allow') {
      return {
        action: 'allow',
        secondFactorRequired: false,
        policy: decision,
        risk,
        reason: 'already-satisfied factors cover the requirement',
      };
    }

    // 5. Need a challenge — pick the factor. Policy-required factors
    //    intersect the enrolled set; risk-only step-up uses all enrolled.
    const usable = decision.required && decision.requirement
      ? decision.requirement.factors.filter((f) => this.enrolledFactors.includes(f))
      : [...this.enrolledFactors];
    const factor = this.pickFactor(usable);
    if (!factor) {
      return {
        action: 'deny',
        secondFactorRequired: false,
        policy: decision,
        risk,
        reason: 'MFA required but no enrolled factor satisfies it',
      };
    }
    return {
      action: 'challenge',
      factor,
      secondFactorRequired: this.decider.requiresSecondFactor(risk),
      policy: decision,
      risk,
      reason: `challenge with '${factor}'`,
    };
  }

  /**
   * Call after a successful challenge — optionally mints a trusted-device
   * token so subsequent attempts skip MFA.
   */
  onChallengePassed(attempt: AuthAttempt, rememberDevice = false): MfaPlan['issuedDeviceToken'] {
    if (!rememberDevice || !attempt.deviceId) return undefined;
    this.devices.registerDevice(attempt.user, attempt.deviceId, 'remembered device');
    const tok = this.devices.issueToken(attempt.user, attempt.deviceId);
    return tok.token;
  }

  /** First preferred factor that's enrolled — independent of risk gate. */
  private pickFactor(usable: readonly string[]): string | null {
    for (const f of ['webauthn', 'totp', 'sms']) {
      if (usable.includes(f)) return f;
    }
    return usable.length > 0 ? usable[0] : null;
  }

  private deviceSatisfies(
    deviceId: string,
    decision: PolicyDecision,
    attempt: AuthAttempt
  ): boolean {
    // A device token satisfies a requirement that accepts 'device'
    // factor; also binds to the right user.
    if (!decision.required || !decision.requirement) return false;
    if (!decision.requirement.factors.includes('device')) return false;
    const ok = this.devices.device(attempt.user, deviceId);
    return ok !== undefined && !ok.revoked;
  }
}
