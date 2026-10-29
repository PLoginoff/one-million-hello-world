/**
 * Multi-Tenancy — Quotas + Rate Limits
 *
 * Per-tenant resource caps enforced by a fixed-window limiter plus gauge
 * counters for concurrent ops and storage.
 *
 *   - Rate limiting: fixed window (`requestsPerWindow` per `windowMs`).
 *     Fixed rather than sliding/token-bucket deliberately — cheap O(1),
 *     predictable for tenants (a clean boundary, not probabilistic), and
 *     fine for the "noisy neighbour" protection this layer provides.
 *   - Concurrency: acquire/release pairs tracking in-flight ops.
 *   - Storage: monotonic counter charged by `chargeStorage`.
 *
 * Quotas are per-tenant objects; a default quota applies when no override
 * exists. `check` vs `consume`: check is dry-run (for admission headers),
 * consume actually counts the request.
 *
 * @module MultiTenancy/Tenancy
 */

import { QuotaUsage, TenantError, TenantErrorCode, TenantQuota, TenancyClock } from './TenantTypes';

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Milliseconds until the current window resets (for Retry-After). */
  readonly retryAfterMs?: number;
  readonly usage: QuotaUsage;
}

interface MutableUsage {
  requestsInWindow: number;
  windowStartedAt: number;
  concurrentOps: number;
  storageBytes: number;
}

const DEFAULT_QUOTA: Required<Omit<TenantQuota, 'maxStorageBytes' | 'maxConcurrentOps'>> & Pick<TenantQuota, 'maxStorageBytes' | 'maxConcurrentOps'> = {
  requestsPerWindow: 1000,
  windowMs: 60_000,
  maxStorageBytes: undefined,
  maxConcurrentOps: undefined,
};

export class TenantQuotaManager {
  private readonly _clock: TenancyClock;
  private readonly _default: TenantQuota;
  private readonly _quotas = new Map<string, TenantQuota>();
  private readonly _usage = new Map<string, MutableUsage>();

  constructor(defaultQuota: TenantQuota = {}, clock: TenancyClock = Date.now) {
    this._clock = clock;
    this._default = { ...DEFAULT_QUOTA, ...defaultQuota };
  }

  /** Set/replace a tenant's quota override. */
  setQuota(tenantId: string, quota: TenantQuota): void {
    this._quotas.set(tenantId, quota);
  }

  removeQuota(tenantId: string): void {
    this._quotas.delete(tenantId);
  }

  quotaFor(tenantId: string): TenantQuota {
    return { ...this._default, ...this._quotas.get(tenantId) };
  }

  /**
   * Consume one request slot. Fixed-window semantics: if the current time
   * is past `windowStartedAt + windowMs`, the window resets first.
   */
  consumeRequest(tenantId: string): QuotaDecision {
    const q = this.quotaFor(tenantId);
    const u = this._usageFor(tenantId);
    this._rollWindow(u, q.windowMs ?? DEFAULT_QUOTA.windowMs);
    const limit = q.requestsPerWindow ?? DEFAULT_QUOTA.requestsPerWindow;
    if (u.requestsInWindow >= limit) {
      const retryAfter = u.windowStartedAt + (q.windowMs ?? DEFAULT_QUOTA.windowMs) - this._clock();
      return {
        allowed: false,
        reason: `rate limit ${limit}/${q.windowMs ?? DEFAULT_QUOTA.windowMs}ms exceeded`,
        retryAfterMs: Math.max(0, retryAfter),
        usage: { ...u },
      };
    }
    u.requestsInWindow++;
    return { allowed: true, usage: { ...u } };
  }

  /** Dry-run request check — doesn't count. */
  checkRequest(tenantId: string): QuotaDecision {
    const q = this.quotaFor(tenantId);
    const u = this._usageFor(tenantId);
    this._rollWindow(u, q.windowMs ?? DEFAULT_QUOTA.windowMs);
    const limit = q.requestsPerWindow ?? DEFAULT_QUOTA.requestsPerWindow;
    if (u.requestsInWindow >= limit) {
      return {
        allowed: false,
        reason: `rate limit ${limit}/${q.windowMs ?? DEFAULT_QUOTA.windowMs}ms exceeded`,
        retryAfterMs: Math.max(0, u.windowStartedAt + (q.windowMs ?? DEFAULT_QUOTA.windowMs) - this._clock()),
        usage: { ...u },
      };
    }
    return { allowed: true, usage: { ...u } };
  }

  /** Acquire a concurrent-op slot; returns a release function. */
  acquireOp(tenantId: string): () => void {
    const q = this.quotaFor(tenantId);
    const u = this._usageFor(tenantId);
    if (q.maxConcurrentOps !== undefined && u.concurrentOps >= q.maxConcurrentOps) {
      throw new TenantError(TenantErrorCode.QUOTA_EXCEEDED, `tenant '${tenantId}' concurrent-op limit ${q.maxConcurrentOps} reached`);
    }
    u.concurrentOps++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        u.concurrentOps = Math.max(0, u.concurrentOps - 1);
      }
    };
  }

  /** Charge storage bytes; throws QUOTA_EXCEEDED past the cap. */
  chargeStorage(tenantId: string, bytes: number): void {
    const q = this.quotaFor(tenantId);
    const u = this._usageFor(tenantId);
    if (q.maxStorageBytes !== undefined && u.storageBytes + bytes > q.maxStorageBytes) {
      throw new TenantError(TenantErrorCode.QUOTA_EXCEEDED, `tenant '${tenantId}' storage cap ${q.maxStorageBytes}B exceeded`);
    }
    u.storageBytes += bytes;
  }

  /** Reclaim storage bytes. */
  releaseStorage(tenantId: string, bytes: number): void {
    const u = this._usageFor(tenantId);
    u.storageBytes = Math.max(0, u.storageBytes - bytes);
  }

  usage(tenantId: string): QuotaUsage {
    const u = this._usageFor(tenantId);
    const q = this.quotaFor(tenantId);
    this._rollWindow(u, q.windowMs ?? DEFAULT_QUOTA.windowMs);
    return { ...u };
  }

  /** Reset a tenant's usage (new billing period, post-purge cleanup). */
  reset(tenantId: string): void {
    this._usage.delete(tenantId);
  }

  private _usageFor(tenantId: string): MutableUsage {
    let u = this._usage.get(tenantId);
    if (!u) {
      u = { requestsInWindow: 0, windowStartedAt: this._clock(), concurrentOps: 0, storageBytes: 0 };
      this._usage.set(tenantId, u);
    }
    return u;
  }

  private _rollWindow(u: MutableUsage, windowMs: number): void {
    if (this._clock() >= u.windowStartedAt + windowMs) {
      u.requestsInWindow = 0;
      u.windowStartedAt = this._clock();
    }
  }
}
