/**
 * Configuration Engine2 — Approval Gate (Two-Person Rule)
 *
 * ConfigHistory records who changed what; this gate enforces that
 * certain paths REQUIRE a second pair of eyes before they may change:
 *
 *   - `protect(pattern, approvers)` — glob-style path patterns
 *     (`security.*`, `payments.**`) bound to a required approval count
 *     and an eligible approver set.
 *   - `propose(actor, changes)` — opens a ChangeRequest covering the
 *     path diffs; requests touching protected paths need `requiredCount`
 *     DISTINCT approvers (the proposer never counts).
 *   - `approve(requestId, approver)` — idempotent per approver; reaching
 *     quorum flips the request to 'approved'.
 *   - `resolve(requestId)` — approved requests commit; expired ones
 *     (TTL past) are rejected; the proposer may cancel their own.
 *   - Overlap detection: two pending requests touching the same
 *     protected path conflict — the second proposal is refused, so
 *     approvals can't race contradictory values through.
 *
 * Wildcards reuse the codebase's grammar: `*` = one segment,
 * `**` = any depth (converted to regex).
 *
 * Complexity: propose O(paths × patterns); approve O(approvers).
 *
 * @module Configuration/Engine2
 */

import { ConfigValue } from '../engine/ConfigTypes';

export interface ProposedChange {
  readonly path: string;
  readonly oldValue: ConfigValue | undefined;
  readonly newValue: ConfigValue | undefined;
}

export type RequestStatus = 'pending' | 'approved' | 'committed' | 'rejected' | 'cancelled' | 'expired';

export interface ChangeRequest {
  readonly requestId: string;
  readonly proposer: string;
  readonly proposedAt: number;
  readonly expiresAt: number;
  readonly changes: readonly ProposedChange[];
  /** Protected paths this request touches (drives quorum). */
  readonly protectedPaths: readonly string[];
  readonly requiredApprovals: number;
  readonly approvals: ReadonlySet<string>;
  status: RequestStatus;
}

export interface ProtectionRule {
  /** Wildcard path pattern. */
  readonly pattern: string;
  /** Distinct approvers required (default 1). */
  readonly requiredCount?: number;
  /** Eligible approver principals; undefined = anyone-but-proposer. */
  readonly approvers?: ReadonlySet<string>;
}

export interface ApprovalGateOptions {
  readonly clock?: () => number;
  /** Pending-request TTL (default 24h). */
  readonly ttlMs?: number;
}

/** `*` → `[^.]+`, `**` → `.*` — same grammar as SecretMasker/engine. */
function patternToRegex(pattern: string): RegExp {
  const esc = pattern
    .split('.')
    .map((seg) => {
      if (seg === '**') return '(?:[^.]+(?:\\.[^.]+)*)?';
      if (seg === '*') return '[^.]+';
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('\\.');
  return new RegExp(`^${esc}$`);
}

interface Rule {
  readonly pattern: string;
  readonly regex: RegExp;
  readonly requiredCount: number;
  readonly approvers: ReadonlySet<string> | null;
}

const DEFAULT_TTL = 24 * 3600_000;

export class ApprovalGate {
  private readonly _clock: () => number;
  private readonly _ttl: number;
  private readonly _rules: Rule[] = [];
  private readonly _requests = new Map<string, ChangeRequest>();
  private _seq = 0;

  constructor(options?: ApprovalGateOptions) {
    this._clock = options?.clock ?? (() => Date.now());
    this._ttl = options?.ttlMs ?? DEFAULT_TTL;
  }

  protect(rule: ProtectionRule): void {
    this._rules.push({
      pattern: rule.pattern,
      regex: patternToRegex(rule.pattern),
      requiredCount: rule.requiredCount ?? 1,
      approvers: rule.approvers ?? null,
    });
  }

  /** Highest requiredCount among matching rules, and whether matched. */
  private _protection(path: string): { protected: boolean; required: number } {
    let required = 0;
    for (const r of this._rules) {
      if (r.regex.test(path)) required = Math.max(required, r.requiredCount);
    }
    return { protected: required > 0, required };
  }

  /** Is any approver from ANY matching rule eligible? */
  private _eligible(path: string, approver: string): boolean {
    let anyRuleHasList = false;
    let listed = false;
    for (const r of this._rules) {
      if (!r.regex.test(path)) continue;
      if (r.approvers === null) {
        listed = true; // unrestricted rule — anyone-but-proposer eligible
      } else {
        anyRuleHasList = true;
        if (r.approvers.has(approver)) listed = true;
      }
    }
    return listed || !anyRuleHasList;
  }

  /**
   * Open a change request. Throws when a pending request already covers
   * one of the same protected paths — conflicting proposals serialize.
   */
  propose(proposer: string, changes: readonly ProposedChange[]): ChangeRequest {
    const now = this._clock();
    const protectedPaths: string[] = [];
    let required = 0;
    for (const c of changes) {
      const p = this._protection(c.path);
      if (p.protected) {
        protectedPaths.push(c.path);
        required = Math.max(required, p.required);
      }
    }

    // Conflict check against pending requests.
    for (const r of this._requests.values()) {
      if (r.status !== 'pending') continue;
      const overlap = r.protectedPaths.some((p) => protectedPaths.includes(p));
      if (overlap) {
        throw new Error(`conflicts with pending request '${r.requestId}'`);
      }
    }

    const req: ChangeRequest = {
      requestId: `cr-${++this._seq}`,
      proposer,
      proposedAt: now,
      expiresAt: now + this._ttl,
      changes,
      protectedPaths,
      requiredApprovals: required,
      approvals: new Set(),
      status: 'pending',
    };
    this._requests.set(req.requestId, req);
    return req;
  }

  /**
   * Cast an approval. The proposer's own approval never counts; the
   * approver must be eligible for EVERY protected path in the request.
   */
  approve(requestId: string, approver: string): ChangeRequest {
    const r = this._get(requestId);
    this._checkLive(r);
    if (approver === r.proposer) {
      throw new Error('proposer cannot approve their own request');
    }
    for (const p of r.protectedPaths) {
      if (!this._eligible(p, approver)) {
        throw new Error(`'${approver}' is not an eligible approver for '${p}'`);
      }
    }
    (r.approvals as Set<string>).add(approver);
    if (r.approvals.size >= r.requiredApprovals) r.status = 'approved';
    return r;
  }

  /** Commit an approved request; rejects expired/pending. */
  resolve(requestId: string): ChangeRequest {
    const r = this._get(requestId);
    this._checkLive(r);
    if (r.status !== 'approved') {
      throw new Error(`cannot resolve '${requestId}': status is ${r.status}`);
    }
    r.status = 'committed';
    return r;
  }

  /** Proposer-only cancellation. */
  cancel(requestId: string, actor: string): boolean {
    const r = this._requests.get(requestId);
    if (!r || r.proposer !== actor) return false;
    if (r.status === 'pending' || r.status === 'approved') {
      r.status = 'cancelled';
      return true;
    }
    return false;
  }

  /** Pending requests past their TTL flip to 'expired'. Returns count. */
  expireStale(): number {
    const now = this._clock();
    let n = 0;
    for (const r of this._requests.values()) {
      if (r.status === 'pending' && r.expiresAt <= now) {
        r.status = 'expired';
        n++;
      }
    }
    return n;
  }

  request(requestId: string): ChangeRequest | undefined {
    return this._requests.get(requestId);
  }

  pending(): readonly ChangeRequest[] {
    return [...this._requests.values()].filter((r) => r.status === 'pending');
  }

  private _get(id: string): ChangeRequest {
    const r = this._requests.get(id);
    if (!r) throw new Error(`unknown request '${id}'`);
    return r;
  }

  private _checkLive(r: ChangeRequest): void {
    if (r.status === 'pending' && r.expiresAt <= this._clock()) {
      r.status = 'expired';
    }
    if (r.status !== 'pending' && r.status !== 'approved') {
      throw new Error(`request '${r.requestId}' is ${r.status}`);
    }
  }
}
