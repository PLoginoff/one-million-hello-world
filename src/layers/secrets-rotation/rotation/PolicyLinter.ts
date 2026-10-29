/**
 * Secrets Rotation — Rotation Policy Linter
 *
 * Static analysis of rotation policies — catches dangerous configs before
 * they're registered: grace windows longer than the rotation interval (keys
 * accumulate, never fully retiring), maxKeyAge shorter than interval (key
 * dies before its scheduled replacement), missing grace on high-traffic
 * secrets, auto-revoke disabled without justification, etc.
 *
 * Each rule produces a LintIssue with severity; `errors()` filters to
 * must-fix vs warnings. This is the same static-safety layer real rotation
 * systems provide (e.g. AWS Secrets Manager rotation best practices).
 *
 * @module SecretsRotation/Rotation
 */

import { RotationPolicy } from './RotationTypes';

export interface LintIssue {
  readonly rule: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
}

export class PolicyLinter {
  /**
   * Lint one policy. Returns issues ordered by severity.
   */
  lint(policy: RotationPolicy): LintIssue[] {
    const issues: LintIssue[] = [];

    // R1: grace must be shorter than the rotation interval — otherwise
    // retiring keys outlive their replacement's replacement.
    if (policy.graceMs >= policy.intervalMs) {
      issues.push({
        rule: 'grace-vs-interval',
        severity: 'error',
        message: `graceMs (${policy.graceMs}) ≥ intervalMs (${policy.intervalMs}): retiring keys would never fully expire before the next rotation`,
      });
    }

    // R2: maxKeyAge must exceed the interval — otherwise the key expires
    // before its scheduled replacement arrives.
    if (policy.maxKeyAgeMs !== undefined && policy.maxKeyAgeMs <= policy.intervalMs) {
      issues.push({
        rule: 'max-age-vs-interval',
        severity: 'error',
        message: `maxKeyAgeMs (${policy.maxKeyAgeMs}) ≤ intervalMs (${policy.intervalMs}): keys will expire before their scheduled replacement`,
      });
    }

    // R3: zero grace on a serving secret is an outage — in-flight signatures
    // fail to verify the instant the old key retires.
    if (policy.graceMs === 0) {
      issues.push({
        rule: 'zero-grace',
        severity: 'warning',
        message: 'graceMs = 0: in-flight verifications fail at cutover — a dual-key window is recommended',
      });
    }

    // R4: very short intervals churn keys without benefit.
    if (policy.intervalMs < 60_000) {
      issues.push({
        rule: 'sub-minute-interval',
        severity: 'warning',
        message: `intervalMs ${policy.intervalMs} < 60s: rotation churn provides no security benefit below minute granularity`,
      });
    }

    // R5: auto-revoke disabled leaves retiring keys valid indefinitely if
    // the sweeper is the only retirement path — audit-worthy, not an error.
    if (policy.autoRevokeOnGraceEnd === false) {
      issues.push({
        rule: 'no-auto-revoke',
        severity: 'info',
        message: 'autoRevokeOnGraceEnd=false: expired keys RETIRE rather than REVOKE — ensure a separate revocation path exists for compromise',
      });
    }

    // R6: staging delay longer than interval means staged keys never
    // activate before the next rotation fires.
    if ((policy.stagingMs ?? 0) >= policy.intervalMs) {
      issues.push({
        rule: 'staging-vs-interval',
        severity: 'error',
        message: `stagingMs (${policy.stagingMs}) ≥ intervalMs (${policy.intervalMs}): staged keys can't activate before the next rotation`,
      });
    }

    const order = { error: 0, warning: 1, info: 2 };
    return issues.sort((a, b) => order[a.severity] - order[b.severity]);
  }

  /** Lint many policies at once; returns per-secret results. */
  lintAll(policies: ReadonlyArray<RotationPolicy>): Map<string, LintIssue[]> {
    const out = new Map<string, LintIssue[]>();
    for (const p of policies) {
      out.set(p.secretId, this.lint(p));
    }
    return out;
  }

  /** True when a policy has no errors (warnings/info allowed). */
  isValid(policy: RotationPolicy): boolean {
    return !this.lint(policy).some((i) => i.severity === 'error');
  }
}
