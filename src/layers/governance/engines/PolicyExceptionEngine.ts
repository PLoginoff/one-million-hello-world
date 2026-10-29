/**
 * Policy Exception Engine
 *
 * Manages time-boxed exceptions to governance policies. An exception is a
 * requester-justified waiver of a specific policy that:
 *
 *  1. Requires N distinct approvers before activation (approval chain).
 *  2. Auto-expires at `expiresAt` — after which the policy applies again.
 *  3. Is rejected outright by any single rejection (veto semantics).
 *
 * The engine is a stub w.r.t. *where* the exception is enforced — it only
 * tracks lifecycle and answers `isExcepted(policyId)` queries that an
 * enforcement point would consult.
 *
 * @module GovernanceLayer/Engines
 */

import {
  ExceptionStatus,
  IClock,
  PolicyException,
  SystemClock,
} from './types';

let exceptionSeq = 0;

export class PolicyExceptionEngine {
  private readonly _exceptions: Map<string, PolicyException>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._exceptions = new Map();
    this._clock = clock;
  }

  /**
   * Request an exception. `requiredApprovals` must be >= 1; exceptions are
   * never self-activating.
   */
  request(
    policyId: string,
    requesterId: string,
    justification: string,
    requiredApprovals: number,
    expiresAt: number
  ): PolicyException {
    if (requiredApprovals < 1) {
      throw new Error('requiredApprovals must be >= 1');
    }
    if (expiresAt <= this._clock.now()) {
      throw new Error('expiresAt must be in the future');
    }
    exceptionSeq += 1;
    const ex: PolicyException = {
      id: `ex-${exceptionSeq.toString(36)}`,
      policyId,
      requesterId,
      justification,
      status: ExceptionStatus.PendingApproval,
      requiredApprovals,
      approvals: [],
      rejectedBy: null,
      createdAt: this._clock.now(),
      expiresAt,
    };
    this._exceptions.set(ex.id, ex);
    return ex;
  }

  /**
   * Record an approval. A requester may not approve their own request.
   * When approvals reach `requiredApprovals` the exception becomes
   * Approved. Approving an already-expired request throws.
   */
  approve(exceptionId: string, approverId: string, comment: string | null = null): PolicyException {
    const ex = this._require(exceptionId);
    this._sweepExpiry(ex);
    if (ex.status !== ExceptionStatus.PendingApproval) {
      throw new Error(`Exception ${exceptionId} is ${ex.status}, cannot approve`);
    }
    if (ex.requesterId === approverId) {
      throw new Error('Requester cannot approve their own exception');
    }
    if (ex.approvals.some((a) => a.approverId === approverId)) {
      throw new Error(`Approver ${approverId} already approved ${exceptionId}`);
    }
    ex.approvals.push({ approverId, approvedAt: this._clock.now(), comment });
    if (ex.approvals.length >= ex.requiredApprovals) {
      ex.status = ExceptionStatus.Approved;
    }
    return ex;
  }

  /** Record a rejection — a single rejection vetoes the request. */
  reject(exceptionId: string, approverId: string): PolicyException {
    const ex = this._require(exceptionId);
    this._sweepExpiry(ex);
    if (ex.status !== ExceptionStatus.PendingApproval) {
      throw new Error(`Exception ${exceptionId} is ${ex.status}, cannot reject`);
    }
    ex.status = ExceptionStatus.Rejected;
    ex.rejectedBy = approverId;
    return ex;
  }

  /**
   * Is `policyId` currently waived for enforcement purposes? True only for
   * approved, unexpired exceptions. Lazily sweeps expiry.
   */
  isExcepted(policyId: string): boolean {
    const now = this._clock.now();
    for (const ex of this._exceptions.values()) {
      if (ex.policyId !== policyId) continue;
      this._sweepExpiry(ex);
      if (ex.status === ExceptionStatus.Approved && ex.expiresAt > now) {
        return true;
      }
    }
    return false;
  }

  /** Transition approved exceptions past `expiresAt` to Expired. Returns count. */
  sweepExpired(): number {
    let swept = 0;
    for (const ex of this._exceptions.values()) {
      if (
        (ex.status === ExceptionStatus.Approved || ex.status === ExceptionStatus.PendingApproval) &&
        ex.expiresAt <= this._clock.now()
      ) {
        ex.status = ExceptionStatus.Expired;
        swept++;
      }
    }
    return swept;
  }

  get(exceptionId: string): PolicyException | null {
    return this._exceptions.get(exceptionId) ?? null;
  }

  /** All exceptions for a policy, any status. */
  forPolicy(policyId: string): PolicyException[] {
    return [...this._exceptions.values()].filter((e) => e.policyId === policyId);
  }

  private _require(id: string): PolicyException {
    const ex = this._exceptions.get(id);
    if (!ex) throw new Error(`Unknown exception: ${id}`);
    return ex;
  }

  private _sweepExpiry(ex: PolicyException): void {
    if (
      (ex.status === ExceptionStatus.Approved || ex.status === ExceptionStatus.PendingApproval) &&
      ex.expiresAt <= this._clock.now()
    ) {
      ex.status = ExceptionStatus.Expired;
    }
  }
}
