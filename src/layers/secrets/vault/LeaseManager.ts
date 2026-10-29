/**
 * Secrets Layer — Dynamic Secret Leases
 *
 * Implements Vault-style leases for *dynamic* secrets: credentials minted
 * on demand that must be renewed or they expire and are revoked.
 *
 * Model
 * -----
 * - `issue(path, ttlMs, opts)` creates a lease backed by a LeaseFactory —
 *   the factory generates the credential material (e.g. a random password,
 *   a scoped token). The lease has `expiresAt = now + ttlMs` and a hard cap
 *   `maxExpiresAt` (default 30× ttl) bounding total lifetime via renewals.
 * - `renew(leaseId, extendMs)` pushes `expiresAt` forward, but never past
 *   `maxExpiresAt` — operators bound how long a credential can be extended
 *   before it *must* be re-issued (a rotation floor).
 * - `revoke(leaseId)` invalidates immediately; the revoked set is kept so a
 *   revoked-then-racing read still reports revoked rather than "not found".
 * - `sweep(now)` expires leases whose `expiresAt` has passed, invoking the
 *   optional `onExpire` hook (where a real system would revoke the upstream
 *   credential — drop the DB user, invalidate the token).
 *
 * Deterministic: injectable clock + id generator. No timers — expiry is
 * evaluated on access and via explicit `sweep`.
 *
 * @module Secrets/Vault
 */

import { randomBytes } from 'crypto';
import { SecretError, SecretErrorCode, SecretLease, SecretsClock } from './SecretTypes';

/** Generates the credential material for a dynamic secret at `path`. */
export type LeaseFactory = (path: string) => { value: string; payload?: Record<string, string> };

export interface LeaseOptions {
  /** Initial TTL in ms. */
  readonly ttlMs: number;
  /** Renewable? (default true) */
  readonly renewable?: boolean;
  /** Absolute cap on expiry regardless of renewals. Default ttlMs × 30. */
  readonly maxTtlMs?: number;
  /** Called when the lease expires or is revoked (cleanup hook). */
  readonly onExpire?: (lease: SecretLease, reason: 'expired' | 'revoked') => void;
}

interface InternalLease {
  lease: SecretLease;
  onExpire?: (lease: SecretLease, reason: 'expired' | 'revoked') => void;
  dead: boolean;
}

export class LeaseManager {
  private readonly _clock: SecretsClock;
  private readonly _idGen: () => string;
  private readonly _leases = new Map<string, InternalLease>();
  private readonly _revoked = new Set<string>();
  private readonly _factories = new Map<string, LeaseFactory>();
  private _defaultFactory: LeaseFactory;

  constructor(clock: SecretsClock = Date.now, idGen: () => string = () => randomBytes(8).toString('hex')) {
    this._clock = clock;
    this._idGen = idGen;
    this._defaultFactory = () => ({ value: randomBytes(24).toString('base64url') });
  }

  /** Register a credential factory for an exact path or prefix (suffix `/`). */
  registerFactory(pathOrPrefix: string, factory: LeaseFactory): void {
    this._factories.set(pathOrPrefix, factory);
  }

  setDefaultFactory(factory: LeaseFactory): void {
    this._defaultFactory = factory;
  }

  /** Issue a dynamic secret. */
  issue(path: string, options: LeaseOptions): SecretLease {
    const now = this._clock();
    const factory = this._factoryFor(path);
    const material = factory(path);
    const lease: SecretLease = {
      leaseId: `lease-${this._idGen()}`,
      path,
      value: material.value,
      issuedAt: now,
      expiresAt: now + options.ttlMs,
      renewable: options.renewable ?? true,
      maxExpiresAt: now + (options.maxTtlMs ?? options.ttlMs * 30),
      ...(material.payload ? { payload: material.payload } : {}),
    };
    const internal: InternalLease = { lease, dead: false };
    if (options.onExpire) internal.onExpire = options.onExpire;
    this._leases.set(lease.leaseId, internal);
    return lease;
  }

  /**
   * Read the live value of a lease — throws LEASE_EXPIRED once past
   * `expiresAt` (and lazily triggers the expiry hook).
   */
  read(leaseId: string): SecretLease {
    const rec = this._mustGet(leaseId);
    if (rec.dead) {
      throw new SecretError(SecretErrorCode.LEASE_EXPIRED, `lease ${leaseId} is revoked/expired`);
    }
    if (this._clock() >= rec.lease.expiresAt) {
      this._kill(rec, 'expired');
      throw new SecretError(SecretErrorCode.LEASE_EXPIRED, `lease ${leaseId} expired at ${rec.lease.expiresAt}`);
    }
    return rec.lease;
  }

  /** Extend a lease's expiry. Returns the updated lease. */
  renew(leaseId: string, extendMs: number): SecretLease {
    const rec = this._mustGet(leaseId);
    if (rec.dead || this._clock() >= rec.lease.expiresAt) {
      if (!rec.dead) this._kill(rec, 'expired');
      throw new SecretError(SecretErrorCode.LEASE_EXPIRED, `lease ${leaseId} is not renewable — expired`);
    }
    if (!rec.lease.renewable) {
      throw new SecretError(SecretErrorCode.LEASE_NOT_RENEWABLE, `lease ${leaseId} is non-renewable`);
    }
    const requested = rec.lease.expiresAt + extendMs;
    const capped = Math.min(requested, rec.lease.maxExpiresAt);
    const updated: SecretLease = { ...rec.lease, expiresAt: capped };
    rec.lease = updated;
    return updated;
  }

  /** Immediately invalidate a lease. */
  revoke(leaseId: string): void {
    const rec = this._leases.get(leaseId);
    if (!rec || rec.dead) return;
    this._kill(rec, 'revoked');
    this._revoked.add(leaseId);
  }

  /** Revoke every live lease under a path (path-prefix revocation). */
  revokePath(pathPrefix: string): number {
    let n = 0;
    for (const rec of this._leases.values()) {
      if (!rec.dead && (rec.lease.path === pathPrefix || rec.lease.path.startsWith(`${pathPrefix}/`))) {
        this._kill(rec, 'revoked');
        this._revoked.add(rec.lease.leaseId);
        n++;
      }
    }
    return n;
  }

  /**
   * Expire all leases past `expiresAt`. Returns the expired leases so the
   * caller can cascade revocation upstream.
   */
  sweep(): SecretLease[] {
    const now = this._clock();
    const expired: SecretLease[] = [];
    for (const rec of this._leases.values()) {
      if (!rec.dead && now >= rec.lease.expiresAt) {
        this._kill(rec, 'expired');
        expired.push(rec.lease);
      }
    }
    return expired;
  }

  /** Live (non-expired) leases — snapshot for introspection. */
  active(): ReadonlyArray<SecretLease> {
    const now = this._clock();
    const out: SecretLease[] = [];
    for (const rec of this._leases.values()) {
      if (!rec.dead && now < rec.lease.expiresAt) out.push(rec.lease);
    }
    return out;
  }

  /** Total issued, live, revoked counts. */
  stats(): { issued: number; active: number; revoked: number } {
    return { issued: this._leases.size, active: this.active().length, revoked: this._revoked.size };
  }

  private _factoryFor(path: string): LeaseFactory {
    if (this._factories.has(path)) return this._factories.get(path) as LeaseFactory;
    // Longest registered prefix wins.
    let best: LeaseFactory | undefined;
    let bestLen = -1;
    for (const [prefix, f] of this._factories) {
      if (prefix.endsWith('/') && path.startsWith(prefix) && prefix.length > bestLen) {
        best = f;
        bestLen = prefix.length;
      }
    }
    return best ?? this._defaultFactory;
  }

  private _mustGet(leaseId: string): InternalLease {
    const rec = this._leases.get(leaseId);
    if (!rec) {
      throw new SecretError(SecretErrorCode.NOT_FOUND, `unknown lease '${leaseId}'`);
    }
    return rec;
  }

  private _kill(rec: InternalLease, reason: 'expired' | 'revoked'): void {
    rec.dead = true;
    rec.onExpire?.(rec.lease, reason);
  }
}
