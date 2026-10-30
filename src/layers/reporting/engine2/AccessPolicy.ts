/**
 * Reporting Engine2 — Report Access Control
 *
 * Who may see which report, at what granularity? A three-level model:
 *
 *   1. REPORT-LEVEL: a policy binds a reportId to allowed roles/users
 *      and a visibility flag (public / restricted / owner-only).
 *   2. COLUMN-LEVEL: `maskedColumns` name result columns visible only to
 *      privileged principals — everyone else gets '***' so the report
 *      shape survives (no confusing dropped-column layouts).
 *   3. ROW-LEVEL: `rowFilter` principals — a predicate restricting which
 *      rows a principal may see (e.g. regional managers see their region).
 *
 * Evaluation order: visibility → role/user grant → column masking →
 * row filtering. Deny-by-default: an unlisted principal on a restricted
 * report gets nothing, and decisions are explainable via `explain()`.
 *
 * Wildcards: role '*' matches any authenticated principal; user grants
 * always beat role denies (direct mention wins).
 *
 * Complexity: decision O(1) (map lookups); filterResult O(rows × cols).
 *
 * @module ReportingLayer/Engine2
 */

import { ReportResult, Row } from '../reports/ReportTypes';

export interface Principal {
  readonly userId: string;
  readonly roles: readonly string[];
}

export type ReportVisibility = 'public' | 'restricted' | 'owner-only';

export interface ReportPolicy {
  readonly reportId: string;
  readonly visibility: ReportVisibility;
  /** The user who owns it — always has full access. */
  readonly owner: string;
  /** Roles allowed when visibility='restricted'. '*' = any role. */
  readonly allowedRoles?: readonly string[];
  /** Users allowed when visibility='restricted' (beats roles). */
  readonly allowedUsers?: readonly string[];
  /** Columns only privileged principals may read in the clear. */
  readonly maskedColumns?: readonly string[];
  /** Roles/users exempt from masking (in addition to owner). */
  readonly unmaskedFor?: readonly string[];
  /** Row-level predicate: principals only see matching rows. */
  readonly rowFilter?: (row: Row, principal: Principal) => boolean;
}

export type AccessDecision =
  | { readonly allowed: true; readonly reason: string }
  | { readonly allowed: false; readonly reason: string };

export const MASK_VALUE = '***';

export class ReportAccessControl {
  private readonly _policies = new Map<string, ReportPolicy>();
  private readonly _decisions: Array<{ reportId: string; userId: string; allowed: boolean; at: number }> = [];
  private _now: () => number;

  constructor(now?: () => number) {
    this._now = now ?? (() => Date.now());
  }

  setPolicy(policy: ReportPolicy): void {
    this._policies.set(policy.reportId, policy);
  }

  policy(reportId: string): ReportPolicy | undefined {
    return this._policies.get(reportId);
  }

  /**
   * May `principal` view the report at all? Deny-by-default, owner always
   * allowed, direct user grants beat role checks.
   */
  decide(reportId: string, principal: Principal): AccessDecision {
    const p = this._policies.get(reportId);
    if (!p) {
      this._log(reportId, principal.userId, false);
      return { allowed: false, reason: `no policy for report '${reportId}'` };
    }
    if (principal.userId === p.owner) {
      this._log(reportId, principal.userId, true);
      return { allowed: true, reason: 'owner' };
    }
    switch (p.visibility) {
      case 'public':
        this._log(reportId, principal.userId, true);
        return { allowed: true, reason: 'public report' };
      case 'owner-only':
        this._log(reportId, principal.userId, false);
        return { allowed: false, reason: 'owner-only report' };
      case 'restricted': {
        if (p.allowedUsers?.includes(principal.userId)) {
          this._log(reportId, principal.userId, true);
          return { allowed: true, reason: 'direct user grant' };
        }
        const roles = p.allowedRoles ?? [];
        if (roles.includes('*') || principal.roles.some((r) => roles.includes(r))) {
          this._log(reportId, principal.userId, true);
          return { allowed: true, reason: 'role grant' };
        }
        this._log(reportId, principal.userId, false);
        return { allowed: false, reason: 'restricted: no matching role or user grant' };
      }
    }
  }

  /** Is the principal exempt from column masking on this report? */
  isUnmasked(reportId: string, principal: Principal): boolean {
    const p = this._policies.get(reportId);
    if (!p) return false;
    if (principal.userId === p.owner) return true;
    const u = p.unmaskedFor ?? [];
    return u.includes(principal.userId) || principal.roles.some((r) => u.includes(r));
  }

  /**
   * Apply row filtering + column masking. Returns null when access is
   * denied entirely; otherwise a NEW ReportResult (input untouched).
   */
  filterResult(reportId: string, principal: Principal, result: ReportResult): ReportResult | null {
    const decision = this.decide(reportId, principal);
    if (!decision.allowed) return null;
    const p = this._policies.get(reportId);
    if (!p) return null;

    let rows = result.rows;
    if (p.rowFilter) {
      const rf = p.rowFilter;
      rows = rows.filter((r) => rf(r, principal));
    }
    const masked = this.isUnmasked(reportId, principal)
      ? new Set<string>()
      : new Set((p.maskedColumns ?? []).filter((c) => result.columns.includes(c)));

    if (masked.size === 0 && rows === result.rows) return result;
    return {
      ...result,
      rows: rows.map((r) => {
        if (masked.size === 0) return r;
        const copy: Record<string, Row[string]> = { ...r };
        for (const c of masked) if (c in copy) copy[c] = MASK_VALUE;
        return copy;
      }),
    };
  }

  /** What a policy check would say — dry-run for admin tooling. */
  explain(reportId: string, principal: Principal): AccessDecision {
    const p = this._policies.get(reportId);
    if (!p) return { allowed: false, reason: `no policy for report '${reportId}'` };
    if (principal.userId === p.owner) return { allowed: true, reason: 'owner' };
    if (p.visibility === 'public') return { allowed: true, reason: 'public report' };
    if (p.visibility === 'owner-only') return { allowed: false, reason: 'owner-only report' };
    if (p.allowedUsers?.includes(principal.userId)) {
      return { allowed: true, reason: 'direct user grant' };
    }
    const roles = p.allowedRoles ?? [];
    if (roles.includes('*') || principal.roles.some((r) => roles.includes(r))) {
      return { allowed: true, reason: 'role grant' };
    }
    return { allowed: false, reason: 'restricted: no matching role or user grant' };
  }

  /** Recent access decisions (append-only audit trail). */
  decisionLog(): ReadonlyArray<{ reportId: string; userId: string; allowed: boolean; at: number }> {
    return this._decisions;
  }

  private _log(reportId: string, userId: string, allowed: boolean): void {
    this._decisions.push({ reportId, userId, allowed, at: this._now() });
  }
}
