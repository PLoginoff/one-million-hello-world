/**
 * ProtectionProxy
 *
 * Access-control proxy evaluating a policy BEFORE every invocation.
 * Policies are pure functions `(principal, method, args) => AccessDecision`,
 * composed with `and`/`or`/`not` combinators — a lightweight specification
 * pattern. Denials throw `ProxyAccessDeniedError`; they are recorded by the
 * engine statistics as failures.
 *
 * Policy resolution order per invocation:
 *   1. method-specific policy (registered via `protect(method, policy)`)
 *   2. default policy (constructor) — allow-all when unset
 * Deny always wins within a composed `and`; method policies REPLACE the
 * default rather than merge with it, keeping semantics predictable.
 *
 * @module ProxyLayer/Engine
 */

import {
  AccessDecision,
  AccessPolicy,
  InvocationContext,
  Principal,
  ProxyAccessDeniedError,
} from './types';

const ALLOW: AccessDecision = { allowed: true };

/**
 * Protects a target object behind access policies.
 */
export class ProtectionProxy<T extends object> {
  private readonly _target: T;
  private readonly _defaultPolicy: AccessPolicy;
  private readonly _methodPolicies: Map<string, AccessPolicy>;
  private readonly _denyLog: Array<{ method: string; principalId: string | null; reason?: string; at: number }>;

  /**
   * @param target - The real subject.
   * @param defaultPolicy - Fallback policy for methods without a specific
   *   registration. Defaults to allow-all.
   */
  constructor(target: T, defaultPolicy?: AccessPolicy) {
    this._target = target;
    this._defaultPolicy = defaultPolicy ?? (() => ALLOW);
    this._methodPolicies = new Map();
    this._denyLog = [];
  }

  /**
   * Registers (or replaces) the policy for one method. Returns `this` for
   * fluent registration.
   */
  protect(method: keyof T & string, policy: AccessPolicy): this {
    this._methodPolicies.set(method, policy);
    return this;
  }

  /**
   * Removes the method-specific policy, reverting to the default.
   */
  unprotect(method: keyof T & string): boolean {
    return this._methodPolicies.delete(method);
  }

  /**
   * Read-only view of the recent denial log (bounded to last 100 entries).
   */
  get denialLog(): ReadonlyArray<{ method: string; principalId: string | null; reason?: string; at: number }> {
    return this._denyLog;
  }

  /**
   * Evaluates the effective policy for `method` without invoking anything
   * and without logging a denial. Useful for capability queries
   * ("can this user call X?").
   */
  check(method: keyof T & string, context: InvocationContext, args: readonly unknown[] = []): AccessDecision {
    const policy = this._methodPolicies.get(method) ?? this._defaultPolicy;
    return policy(context.principal, method, args);
  }

  /**
   * Evaluates the effective policy for `method` and throws on denial — the
   * guard used when the caller dispatches through other machinery (e.g.
   * ProxyEngine) rather than this proxy's own invoke().
   *
   * @throws ProxyAccessDeniedError when the policy denies access.
   */
  guard(method: string, args: readonly unknown[], context: InvocationContext): void {
    const policy = this._methodPolicies.get(method) ?? this._defaultPolicy;
    const decision = policy(context.principal, method, args);
    if (!decision.allowed) {
      const principalId = context.principal?.id ?? null;
      this._denyLog.push({ method, principalId, reason: decision.reason, at: Date.now() });
      if (this._denyLog.length > 100) {
        this._denyLog.splice(0, this._denyLog.length - 100);
      }
      throw new ProxyAccessDeniedError(method, principalId, decision.reason);
    }
  }

  /**
   * Invokes `method` on the target after a successful policy check.
   *
   * @throws ProxyAccessDeniedError when the policy denies access.
   * @throws TypeError when `method` is not callable on the target.
   */
  async invoke<R = unknown>(
    method: keyof T & string,
    args: readonly unknown[],
    context: InvocationContext
  ): Promise<R> {
    this.guard(method, args, context);

    const fn = this._target[method];
    if (typeof fn !== 'function') {
      throw new TypeError(`ProtectionProxy: '${method}' is not callable on target`);
    }
    return (await (fn as (...a: unknown[]) => unknown).apply(this._target, [...args])) as R;
  }

  // ---------------------------------------------------------------------
  // Policy combinators and factories
  // ---------------------------------------------------------------------

  /** Logical AND over policies — first denial wins (fail-fast). */
  static and(...policies: AccessPolicy[]): AccessPolicy {
    return (principal, method, args) => {
      for (const policy of policies) {
        const decision = policy(principal, method, args);
        if (!decision.allowed) {
          return decision;
        }
      }
      return ALLOW;
    };
  }

  /** Logical OR — first allowance wins. */
  static or(...policies: AccessPolicy[]): AccessPolicy {
    return (principal, method, args) => {
      let lastDenial: AccessDecision = { allowed: false, reason: 'no policy allowed' };
      for (const policy of policies) {
        const decision = policy(principal, method, args);
        if (decision.allowed) {
          return ALLOW;
        }
        lastDenial = decision;
      }
      return lastDenial;
    };
  }

  /** Logical NOT. */
  static not(policy: AccessPolicy): AccessPolicy {
    return (principal, method, args) => {
      const decision = policy(principal, method, args);
      return decision.allowed ? { allowed: false, reason: 'negated policy' } : ALLOW;
    };
  }

  /** Requires an authenticated principal (any). */
  static requireAuthenticated(): AccessPolicy {
    return (principal) =>
      principal ? ALLOW : { allowed: false, reason: 'authentication required' };
  }

  /** Requires the principal to hold at least one of `roles`. */
  static requireRole(...roles: string[]): AccessPolicy {
    const wanted = new Set(roles);
    return (principal) => {
      if (!principal) {
        return { allowed: false, reason: 'authentication required' };
      }
      const ok = principal.roles.some((r) => wanted.has(r));
      return ok
        ? ALLOW
        : { allowed: false, reason: `requires role: ${roles.join(' | ')}` };
    };
  }

  /** Requires the principal to hold ALL of `roles`. */
  static requireAllRoles(...roles: string[]): AccessPolicy {
    return (principal) => {
      if (!principal) {
        return { allowed: false, reason: 'authentication required' };
      }
      const missing = roles.filter((r) => !principal.roles.includes(r));
      return missing.length === 0
        ? ALLOW
        : { allowed: false, reason: `missing roles: ${missing.join(', ')}` };
    };
  }

  /** Restricts to an explicit set of principal ids. */
  static allowPrincipals(...ids: string[]): AccessPolicy {
    const set = new Set(ids);
    return (principal) =>
      principal && set.has(principal.id)
        ? ALLOW
        : { allowed: false, reason: 'principal not in allow-list' };
  }

  /**
   * Argument predicate — allows only when `predicate(args)` is true.
   * Useful for e.g. "may only delete own records" style checks.
   */
  static requireArg(predicate: (args: readonly unknown[]) => boolean, reason: string): AccessPolicy {
    return (_principal, _method, args) => (predicate(args) ? ALLOW : { allowed: false, reason });
  }
}
