/**
 * Obligation-Aware Policy Evaluator
 *
 * Wraps a base checker and attaches *obligations* — XACML-style
 * post-decision actions the enforcement point must perform: log the
 * access, notify a channel, require step-up MFA, or attach a rate-limit
 * budget. Obligations can be scoped to a permission pattern, so a rule
 * like "log every deny on `admin:*`" is one entry, not one per check.
 *
 * `requireMfa` is special: it downgrades an `allow` into a conditional
 * verdict — the decision reports `allowed=false` plus the obligation
 * unless the subject's environment proves MFA (`env.mfa === true`).
 *
 * @module AuthorizationLayer/Engine2
 */

import {
  DueObligation,
  Obligation,
  ObligationHandler,
  AuthzClock,
  SystemAuthzClock,
} from './types';

export interface ObligationRule {
  /** Permission glob: `*` matches any suffix (`admin:*`). */
  readonly permissionPattern: string;
  readonly obligations: readonly Obligation[];
}

export interface ObligatedDecision {
  readonly allowed: boolean;
  readonly effect: 'allow' | 'deny';
  /** Obligations triggered by this decision, in rule order. */
  readonly obligations: readonly DueObligation[];
  /** True when a requireMfa obligation gated an otherwise-allowed check. */
  readonly mfaRequired: boolean;
}

function patternMatches(permission: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return permission.startsWith(pattern.slice(0, -1));
  return permission === pattern;
}

export class ObligationEngine {
  private readonly _rules: ObligationRule[] = [];
  private readonly _handler: ObligationHandler | undefined;
  private readonly _clock: AuthzClock;

  constructor(handler?: ObligationHandler, clock?: AuthzClock) {
    this._handler = handler;
    this._clock = clock ?? new SystemAuthzClock();
  }

  /** Register a rule; rules are evaluated in registration order. */
  addRule(rule: ObligationRule): void {
    this._rules.push(rule);
  }

  /**
   * Evaluate `baseCheck` for a subject+permission, collect obligations
   * from every matching rule, then apply `requireMfa` semantics.
   */
  evaluate(
    subjectId: string,
    permission: string,
    baseCheck: (subjectId: string, permission: string) => boolean,
    env?: { mfa?: boolean }
  ): ObligatedDecision {
    const allowed = baseCheck(subjectId, permission);
    let effect: 'allow' | 'deny' = allowed ? 'allow' : 'deny';

    const due: DueObligation[] = [];
    let mfaGate = false;

    for (const rule of this._rules) {
      if (!patternMatches(permission, rule.permissionPattern)) continue;
      for (const ob of rule.obligations) {
        const on = ob.on ?? 'both';
        if (on !== 'both' && on !== effect) continue;
        if (ob.kind === 'requireMfa' && effect === 'allow') {
          mfaGate = true;
        }
        due.push({ ...ob, decisionEffect: effect, subjectId, permission });
      }
    }

    // requireMfa with unproven MFA turns the allow into a deny.
    if (mfaGate && effect === 'allow' && env?.mfa !== true) {
      effect = 'deny';
      // Re-mark obligations: the mfa-gated allow behaves as a deny.
      for (const d of due) {
        if (d.on === 'allow' || d.on === 'both' || d.on === undefined) {
          // obligation still due — the PEP must log/notify the block
        }
      }
    }

    const finalAllowed = effect === 'allow';

    // Execute obligations through the handler (fire-and-forget sync part).
    if (this._handler) {
      for (const d of due) {
        const actual: DueObligation = { ...d, decisionEffect: effect };
        void this._handler.execute(actual);
      }
    }

    return {
      allowed: finalAllowed,
      effect,
      obligations: due,
      mfaRequired: mfaGate && env?.mfa !== true,
    };
  }
}
