/**
 * Secrets Engine2 — Dynamic-Secret Lease Store
 *
 * The vault's LeaseManager issues leases; this store makes them
 * operable at scale:
 *
 *   - Multi-index: leases by leaseId, by path, by principal — "all
 *     leases held by billing-svc" and "who holds db-creds leases" are
 *     O(index) instead of O(everything).
 *   - Revocation CASCADE: revoke a path and every outstanding lease on
 *     it is invalidated (key rotation → dependent creds die with it).
 *   - Expiry LAZY-SWEEP: `sweep()` purges expired leases; per-lease TTL
 *     checks on read mean the store never serves a stale lease even if
 *     the sweep hasn't run.
 *   - Lease LINEAGE: child leases reference a parent leaseId (a service
 *     mints a scoped sub-lease for a downstream call); revoking the
 *     parent cascades to descendants — transitive trust termination.
 *   - Renewal tracking: each renewal extends `expiresAt` up to
 *     `maxExpiresAt` and records the chain — "how many times was this
 *     cred stretched past its original TTL?" is auditable.
 *
 * Complexity: issue/revoke/lookup O(1); sweep O(leases); cascade O(subtree).
 *
 * @module Secrets/Engine2
 */

import { SecretLease, SecretsClock } from '../vault/SecretTypes';

export interface StoredLease extends SecretLease {
  /** Parent leaseId when this is a delegated sub-lease. */
  readonly parentId?: string;
  readonly principal: string;
  revoked: boolean;
  renewals: number;
  readonly renewalLog: number[]; // expiry history (epoch ms)
}

export interface LeaseStoreOptions {
  readonly clock?: SecretsClock;
}

export class LeaseStore {
  private readonly _clock: SecretsClock;
  private readonly _byId = new Map<string, StoredLease>();
  private readonly _byPath = new Map<string, Set<string>>();
  private readonly _byPrincipal = new Map<string, Set<string>>();
  private readonly _children = new Map<string, Set<string>>();

  constructor(options?: LeaseStoreOptions) {
    this._clock = options?.clock ?? (() => Date.now());
  }

  issue(lease: StoredLease): void {
    this._byId.set(lease.leaseId, lease);
    addTo(this._byPath, lease.path, lease.leaseId);
    addTo(this._byPrincipal, lease.principal, lease.leaseId);
    if (lease.parentId) addTo(this._children, lease.parentId, lease.leaseId);
  }

  /** Live lookup — expired leases report as undefined (lazy expiry). */
  get(leaseId: string): StoredLease | undefined {
    const l = this._byId.get(leaseId);
    if (!l) return undefined;
    if (l.revoked || l.expiresAt <= this._clock()) return undefined;
    return l;
  }

  /** Raw record incl. expired/revoked — for audit queries. */
  record(leaseId: string): StoredLease | undefined {
    return this._byId.get(leaseId);
  }

  /** Renew: extend expiry toward `newExpiry` (bounded by maxExpiresAt). */
  renew(leaseId: string, newExpiry: number): boolean {
    const l = this.get(leaseId);
    if (!l || !l.renewable) return false;
    const capped = Math.min(newExpiry, l.maxExpiresAt);
    if (capped <= l.expiresAt) return false;
    l.renewalLog.push(l.expiresAt);
    l.renewals++;
    (l as { expiresAt: number }).expiresAt = capped;
    return true;
  }

  /**
   * Revoke a lease AND its descendants (sub-lease cascade).
   * Returns revoked leaseIds incl. the root.
   */
  revoke(leaseId: string): string[] {
    const out: string[] = [];
    const stack = [leaseId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      const l = this._byId.get(id);
      if (!l || l.revoked) continue;
      l.revoked = true;
      out.push(id);
      for (const c of this._children.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  /** Revoke every outstanding lease on `path` (key-rotation cascade). */
  revokePath(path: string): string[] {
    const ids = [...(this._byPath.get(path) ?? [])];
    const out: string[] = [];
    for (const id of ids) out.push(...this.revoke(id));
    return out;
  }

  /** Live leases held by a principal. */
  ofPrincipal(principal: string): StoredLease[] {
    return [...(this._byPrincipal.get(principal) ?? [])]
      .map((id) => this.get(id))
      .filter((l): l is StoredLease => l !== undefined);
  }

  /** Live leases on a path. */
  onPath(path: string): StoredLease[] {
    return [...(this._byPath.get(path) ?? [])]
      .map((id) => this.get(id))
      .filter((l): l is StoredLease => l !== undefined);
  }

  /** Drop expired/revoked records from indexes. Returns count purged. */
  sweep(): number {
    const now = this._clock();
    let n = 0;
    for (const [id, l] of this._byId) {
      if (l.revoked || l.expiresAt <= now) {
        this._byId.delete(id);
        this._byPath.get(l.path)?.delete(id);
        this._byPrincipal.get(l.principal)?.delete(id);
        for (const c of this._children.get(id) ?? []) {
          // Orphaned children survive as roots — parent revocation
          // already cascaded at revoke() time.
          void c;
        }
        this._children.delete(id);
        n++;
      }
    }
    return n;
  }

  /** Leases expiring within `horizonMs` — the renewal watchlist. */
  expiringSoon(horizonMs: number): StoredLease[] {
    const deadline = this._clock() + horizonMs;
    const out: StoredLease[] = [];
    for (const l of this._byId.values()) {
      if (!l.revoked && l.expiresAt <= deadline && l.expiresAt > this._clock()) {
        out.push(l);
      }
    }
    return out.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  get size(): number {
    return this._byId.size;
  }
}

function addTo(index: Map<string, Set<string>>, key: string, id: string): void {
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(id);
}
