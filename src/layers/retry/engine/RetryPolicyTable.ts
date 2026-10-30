/**
 * RetryPolicyTable — per-scope retry policies with longest-prefix routing.
 *
 * Different dependencies need different retry policies: `payments` gets
 * 1 retry (money), `search` gets 5 (cheap), `metrics` gets 0 (loss is
 * fine). This table routes a scope key (e.g. `"payments:charge"`,
 * `"search:autocomplete"`) to the most specific matching policy:
 *
 *   "payments"         → payments policy
 *   "payments:charge"  → charge-specific override if registered,
 *                        else falls back to "payments"
 *   "other"            → default policy
 *
 * Matching is longest-prefix on `:`-separated segments — the standard
 * hierarchical-scope routing (envoy, gRPC service configs use the same).
 *
 * A policy is a *value object*: maxAttempts, whether retries are allowed
 * at all, retryable statuses, base delay — enough for `RetryEngine` to
 * make decisions without embedding the engine itself.
 *
 * @module RetryLayer/Engine
 */

import { RetryReason } from './types';

export interface ScopePolicy {
  /** Total attempts allowed (1 = never retry). */
  maxAttempts: number;
  /** Master switch; `false` always short-circuits. */
  retryEnabled: boolean;
  /** Statuses this scope treats as retryable (on top of 5xx/429). */
  extraRetryableStatuses?: readonly number[];
  /** Override base delay (ms); `undefined` = adaptive default. */
  baseDelayMs?: number;
  /** Human label for auditability. */
  description?: string;
}

export interface ResolvedPolicy extends ScopePolicy {
  /** The key that supplied this policy (for "which rule matched" debugging). */
  matchedKey: string;
  /** How many path segments matched (0 = default). */
  matchDepth: number;
}

export class RetryPolicyTable {
  private readonly _policies = new Map<string, ScopePolicy>();
  private readonly _default: ScopePolicy;

  constructor(defaultPolicy: ScopePolicy = { maxAttempts: 3, retryEnabled: true }) {
    this._default = defaultPolicy;
  }

  /** Register a policy for a scope prefix. */
  set(scope: string, policy: ScopePolicy): void {
    this._policies.set(scope, policy);
  }

  remove(scope: string): boolean {
    return this._policies.delete(scope);
  }

  /**
   * Longest-prefix match: `resolve("a:b:c")` checks `"a:b:c"`,
   * `"a:b"`, `"a"`, then default.
   */
  resolve(scope: string): ResolvedPolicy {
    const segments = scope.split(':');
    for (let depth = segments.length; depth >= 1; depth--) {
      const prefix = segments.slice(0, depth).join(':');
      const p = this._policies.get(prefix);
      if (p) return { ...p, matchedKey: prefix, matchDepth: depth };
    }
    return { ...this._default, matchedKey: '<default>', matchDepth: 0 };
  }

  /**
   * Would `policy` allow another retry given `attempt` (0-based, the
   * attempt that just failed) and the failure's reason?
   */
  shouldRetry(policy: ResolvedPolicy, attempt: number, reason: RetryReason): boolean {
    if (!policy.retryEnabled) return false;
    if (attempt + 1 >= policy.maxAttempts) return false;
    switch (reason) {
      case RetryReason.CLIENT_ERROR:
        return false; // 4xx ≠ 429 is not retryable
      case RetryReason.UNKNOWN:
        return false;
      default:
        return true;
    }
  }

  /** All registered scope prefixes. */
  scopes(): string[] {
    return Array.from(this._policies.keys());
  }
}
