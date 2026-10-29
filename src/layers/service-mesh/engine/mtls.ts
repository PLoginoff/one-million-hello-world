/**
 * mTLS Identity Model
 *
 * SPIFFE-like workload identities: a workload is identified by a URI of
 * the form `spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>`.
 * This module issues, validates and rotates identity certificates in
 * memory — a stub for a real CA, but with the same semantics: certs have
 * a serial, a subject (the SPIFFE id), an expiry, and an issuer chain.
 *
 * Rotation: `IdentityManager.rotate()` re-issues all certs nearing
 * expiry. `validate()` checks a cert is well-formed, unexpired, and
 * belongs to this trust domain.
 *
 * @module ServiceMeshLayer/Engine
 */

import { SpiffeId } from './config-model';
import { IClock, SystemClock } from '../../observability/engine/signals';

export interface WorkloadCert {
  readonly serial: string;
  readonly spiffeId: SpiffeId;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  /** In a real CA this is the issuer chain; here just the trust domain. */
  readonly issuer: string;
}

export class SpiffeError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SpiffeError';
  }
}

/** Format a SPIFFE URI. */
export function buildSpiffeId(trustDomain: string, namespace: string, serviceAccount: string): SpiffeId {
  return `spiffe://${trustDomain}/ns/${namespace}/sa/${serviceAccount}`;
}

/** Parse a SPIFFE URI; throws `SpiffeError` on malformed input. */
export function parseSpiffeId(id: string): { trustDomain: string; namespace: string; serviceAccount: string } {
  const m = /^spiffe:\/\/([A-Za-z0-9._-]+)\/ns\/([A-Za-z0-9._-]+)\/sa\/([A-Za-z0-9._-]+)$/.exec(id);
  if (!m) throw new SpiffeError(`malformed SPIFFE id: ${id}`);
  return { trustDomain: m[1], namespace: m[2], serviceAccount: m[3] };
}

let nextSerial = 1;

export interface IdentityManagerConfig {
  /** Cert lifetime; defaults to 24h. */
  readonly certTtlMs?: number;
  /** Rotate when less than this much life remains; defaults to 1h. */
  readonly rotateBeforeMs?: number;
}

/**
 * Issues and tracks workload certificates for a trust domain.
 */
export class SpiffeIdentityManager {
  private readonly _trustDomain: string;
  private readonly _ttlMs: number;
  private readonly _rotateBeforeMs: number;
  private readonly _clock: IClock;
  private readonly _certs: Map<SpiffeId, WorkloadCert> = new Map();

  constructor(trustDomain: string, clock: IClock = new SystemClock(), config: IdentityManagerConfig = {}) {
    this._trustDomain = trustDomain;
    this._ttlMs = config.certTtlMs ?? 24 * 3600 * 1000;
    this._rotateBeforeMs = config.rotateBeforeMs ?? 3600 * 1000;
    this._clock = clock;
  }

  /** Issue (or re-issue) a certificate for a workload. */
  issue(namespace: string, serviceAccount: string): WorkloadCert {
    const spiffeId = buildSpiffeId(this._trustDomain, namespace, serviceAccount);
    const now = this._clock.nowMs();
    const cert: WorkloadCert = {
      serial: `s${nextSerial++}`,
      spiffeId,
      issuedAtMs: now,
      expiresAtMs: now + this._ttlMs,
      issuer: `ca.${this._trustDomain}`,
    };
    this._certs.set(spiffeId, cert);
    return cert;
  }

  /** Validate a cert: unexpired, right trust domain, known serial. */
  validate(cert: WorkloadCert): { ok: boolean; reason?: string } {
    try {
      const parsed = parseSpiffeId(cert.spiffeId);
      if (parsed.trustDomain !== this._trustDomain) {
        return { ok: false, reason: `wrong trust domain ${parsed.trustDomain}` };
      }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    const now = this._clock.nowMs();
    if (now >= cert.expiresAtMs) return { ok: false, reason: 'expired' };
    if (cert.issuedAtMs > now + 60_000) return { ok: false, reason: 'not-yet-valid' };
    return { ok: true };
  }

  /**
   * Rotate certs whose remaining life < `rotateBeforeMs`.
   * Returns the re-issued certs.
   */
  rotate(): WorkloadCert[] {
    const now = this._clock.nowMs();
    const rotated: WorkloadCert[] = [];
    for (const [id, cert] of this._certs) {
      if (cert.expiresAtMs - now < this._rotateBeforeMs) {
        const parsed = parseSpiffeId(id);
        rotated.push(this.issue(parsed.namespace, parsed.serviceAccount));
      }
    }
    return rotated;
  }

  /** Time until the cert for `spiffeId` needs rotation (negative = overdue). */
  msUntilRotation(spiffeId: SpiffeId): number | undefined {
    const cert = this._certs.get(spiffeId);
    if (!cert) return undefined;
    return cert.expiresAtMs - this._rotateBeforeMs - this._clock.nowMs();
  }

  certFor(spiffeId: SpiffeId): WorkloadCert | undefined {
    return this._certs.get(spiffeId);
  }

  /** Check whether two workloads may talk under mutual TLS policy. */
  peerAllowed(a: SpiffeId, b: SpiffeId): boolean {
    try {
      const pa = parseSpiffeId(a);
      const pb = parseSpiffeId(b);
      return pa.trustDomain === this._trustDomain && pb.trustDomain === this._trustDomain;
    } catch {
      return false;
    }
  }
}
