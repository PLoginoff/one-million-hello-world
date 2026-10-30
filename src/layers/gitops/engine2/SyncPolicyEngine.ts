/**
 * Sync Policy Engine — who may sync what, automatically?
 *
 * GitOps posture differs by blast radius: `dev` namespaces auto-sync on
 * every commit; `prod` wants a human gate; `staging` might auto-apply
 * after a quiet approval window ("apply at 02:00 unless someone says no").
 *
 * Policies match namespaces by glob (`prod-*`, `*`, exact) with the most
 * specific match winning — a `prod-payments` policy beats `prod-*` beats
 * `*`, mirroring firewall-rule precedence.
 *
 * Also enforces *magnitude* gates: an auto policy may cap how many
 * resources a single sync touches — a 200-resource change isn't a
 * routine sync, it's a migration, and deserves the manual path even in
 * dev.
 *
 * Complexity: O(policies) per decision — the policy set is small.
 *
 * @module GitopsLayer/Engine2
 */

import { IClock, SystemClock } from '../engines/types';
import { NamespacePolicy, SyncDecision } from './types';

export interface SyncContext {
  readonly namespace: string;
  /** Resources the pending sync would touch. */
  readonly resourceCount: number;
  /** When the sync request arrived (defaults to clock.now()). */
  readonly requestedAt?: number;
}

export class SyncPolicyEngine {
  private readonly _clock: IClock;
  private _policies: NamespacePolicy[] = [];

  constructor(policies: readonly NamespacePolicy[] = [], clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._policies = [...policies];
  }

  addPolicy(policy: NamespacePolicy): void {
    this._policies.push(policy);
    this._policies = SyncPolicyEngine._sort(this._policies);
  }

  removePolicy(namespace: string): boolean {
    const before = this._policies.length;
    this._policies = this._policies.filter((p) => p.namespace !== namespace);
    return this._policies.length < before;
  }

  /**
   * Decide how a sync for `ctx.namespace` proceeds.
   *
   *   manual                    → always await-approval (no timer)
   *   auto-with-approval-window → auto after approvalWindowMs of quiet
   *   auto                      → auto, unless it exceeds maxAutoResources
   *                               → then blocked (needs manual handling)
   */
  decide(ctx: SyncContext): SyncDecision {
    const policy = this._match(ctx.namespace);
    if (!policy) {
      // No policy = deny by default — GitOps without policy is a script.
      return { kind: 'blocked', reason: `no sync policy for namespace "${ctx.namespace}"` };
    }
    if (policy.maxAutoResources !== undefined && ctx.resourceCount > policy.maxAutoResources) {
      return {
        kind: 'blocked',
        reason: `sync touches ${ctx.resourceCount} resources > policy cap ${policy.maxAutoResources} — requires manual handling`,
      };
    }
    switch (policy.mode) {
      case 'auto':
        return { kind: 'auto' };
      case 'manual':
        return { kind: 'await-approval', applyAfter: null };
      case 'auto-with-approval-window': {
        const requestedAt = ctx.requestedAt ?? this._clock.now();
        const window = policy.approvalWindowMs ?? 0;
        return { kind: 'await-approval', applyAfter: requestedAt + window };
      }
    }
  }

  /**
   * Is a previously-requested sync now past its approval window?
   * Callers poll this; when true the sync may proceed without a human.
   */
  windowElapsed(ctx: SyncContext): boolean {
    const d = this.decide(ctx);
    if (d.kind !== 'await-approval' || d.applyAfter === null) return false;
    return this._clock.now() >= d.applyAfter;
  }

  policies(): readonly NamespacePolicy[] {
    return this._policies;
  }

  /* ---------------------------------------------------------------- */

  /**
   * Most-specific match wins. Specificity = (non-glob chars, -glob count)
   * — "prod-payments" (13 chars, 0 globs) > "prod-*" (5 chars, 1 glob)
   * > "*" (0 chars, 1 glob).
   */
  private _match(namespace: string): NamespacePolicy | null {
    let best: NamespacePolicy | null = null;
    let bestSpec = -1;
    for (const p of this._policies) {
      if (!this._matches(p.namespace, namespace)) continue;
      const spec = p.namespace.replace(/\*/g, '').length;
      if (spec > bestSpec) {
        best = p;
        bestSpec = spec;
      }
    }
    return best;
  }

  /** Glob match: `*` = any suffix. `prod-*` matches `prod-a`, `prod`. */
  private _matches(pattern: string, ns: string): boolean {
    if (pattern === '*') return true;
    if (pattern === ns) return true;
    if (pattern.endsWith('*')) return ns.startsWith(pattern.slice(0, -1));
    return false;
  }

  private static _sort(policies: NamespacePolicy[]): NamespacePolicy[] {
    return [...policies].sort(
      (a, b) => b.namespace.replace(/\*/g, '').length - a.namespace.replace(/\*/g, '').length
    );
  }
}
