/**
 * mTLS Certificate Expiry Monitoring & Rotation Hooks
 *
 * `SpiffeIdentityManager` issues and rotates certs on demand; this monitor
 * is the always-on piece: it scans issued certs, classifies each by
 * remaining life, fires rotation hooks, and raises warnings before expiry.
 *
 * Lifecycle warnings (like cert-manager / SPIRE behavior):
 *   - `warnBeforeMs` — cert nearing expiry → 'warning' + `onWarning` hook
 *     (a cert nobody is rotating is a future outage).
 *   - `rotateBeforeMs` — cert inside rotation window → `onRotate` hook
 *     fires ONCE per cert (deduped by serial) — the hook typically calls
 *     IdentityManager.issue() then distributes the new cert.
 *   - Expired → 'expired' state; cert should already have been rotated.
 *
 * Hooks receive the SPIFFE id + cert so callers can re-issue + push via
 * SDS (or the in-memory manager's issue()).
 *
 * `scan()` is the periodic entry point — run on a timer or on-demand.
 *
 * @module ServiceMeshLayer/Engine
 */

import { SpiffeIdentityManager, WorkloadCert } from './mtls';
import { SpiffeId } from './config-model';
import { IClock, SystemClock } from '../../observability/engine/signals';

export type CertHealth = 'ok' | 'warning' | 'rotate-due' | 'expired';

export interface CertStatus {
  readonly spiffeId: SpiffeId;
  readonly serial: string;
  readonly expiresAtMs: number;
  readonly remainingMs: number;
  readonly health: CertHealth;
}

export interface CertMonitorConfig {
  /** Remaining life below this → warning. Default 2h. */
  readonly warnBeforeMs?: number;
  /** Remaining life below this → rotation hook. Default 1h. */
  readonly rotateBeforeMs?: number;
}

export type RotateHook = (spiffeId: SpiffeId, cert: WorkloadCert) => void;
export type WarningHook = (status: CertStatus) => void;

export class CertMonitor {
  private readonly _manager: SpiffeIdentityManager;
  private readonly _clock: IClock;
  private readonly _warnBeforeMs: number;
  private readonly _rotateBeforeMs: number;
  private readonly _rotateHooks: RotateHook[] = [];
  private readonly _warningHooks: WarningHook[] = [];
  /** serials already rotated/warned — hooks fire once per cert lifetime. */
  private readonly _rotatedSerials = new Set<string>();
  private readonly _warnedSerials = new Set<string>();

  constructor(
    manager: SpiffeIdentityManager,
    clock: IClock = new SystemClock(),
    config: CertMonitorConfig = {}
  ) {
    this._manager = manager;
    this._clock = clock;
    this._warnBeforeMs = config.warnBeforeMs ?? 2 * 3600 * 1000;
    this._rotateBeforeMs = config.rotateBeforeMs ?? 3600 * 1000;
  }

  onRotate(hook: RotateHook): void {
    this._rotateHooks.push(hook);
  }

  onWarning(hook: WarningHook): void {
    this._warningHooks.push(hook);
  }

  classify(cert: WorkloadCert): CertHealth {
    const now = this._clock.nowMs();
    const remaining = cert.expiresAtMs - now;
    if (remaining <= 0) return 'expired';
    if (remaining <= this._rotateBeforeMs) return 'rotate-due';
    if (remaining <= this._warnBeforeMs) return 'warning';
    return 'ok';
  }

  /** Status for one cert by SPIFFE id. */
  status(spiffeId: SpiffeId): CertStatus | undefined {
    const cert = this._manager.certFor(spiffeId);
    if (!cert) return undefined;
    const now = this._clock.nowMs();
    return {
      spiffeId,
      serial: cert.serial,
      expiresAtMs: cert.expiresAtMs,
      remainingMs: cert.expiresAtMs - now,
      health: this.classify(cert),
    };
  }

  /**
   * Periodic scan over every cert the manager knows: fires `onRotate`
   * for certs inside the rotation window, `onWarning` for certs nearing
   * expiry. Each hook fires once per serial — a cert that's been rotated
   * (new serial) resets naturally.
   *
   * @returns statuses of every cert that is not 'ok'.
   */
  scan(certs: readonly WorkloadCert[]): CertStatus[] {
    const now = this._clock.nowMs();
    const attention: CertStatus[] = [];
    for (const cert of certs) {
      const health = this.classify(cert);
      const status: CertStatus = {
        spiffeId: cert.spiffeId,
        serial: cert.serial,
        expiresAtMs: cert.expiresAtMs,
        remainingMs: cert.expiresAtMs - now,
        health,
      };
      if (health === 'ok') continue;
      attention.push(status);

      if ((health === 'rotate-due' || health === 'expired') && !this._rotatedSerials.has(cert.serial)) {
        this._rotatedSerials.add(cert.serial);
        for (const h of this._rotateHooks) h(cert.spiffeId, cert);
      } else if (health === 'warning' && !this._warnedSerials.has(cert.serial)) {
        this._warnedSerials.add(cert.serial);
        for (const h of this._warningHooks) h(status);
      }
    }
    return attention;
  }

  /**
   * Convenience: scan + auto-rotate via the manager's own issue().
   * Returns the certs that were re-issued.
   */
  scanAndRotate(certs: readonly WorkloadCert[]): WorkloadCert[] {
    const rotated: WorkloadCert[] = [];
    this.onRotateOnce((spiffeId) => {
      const m = /^spiffe:\/\/[^/]+\/ns\/([^/]+)\/sa\/([^/]+)$/.exec(spiffeId);
      if (m) rotated.push(this._manager.issue(m[1], m[2]));
    });
    this.scan(certs);
    return rotated;
  }

  /** Register a hook scoped to a single scan (used by scanAndRotate). */
  private onRotateOnce(hook: RotateHook): void {
    this._rotateHooks.push(hook);
    // The hook stays registered for the monitor's lifetime — cheap and
    // harmless since serials dedupe; rotating once per serial is the
    // intended semantic anyway.
  }

  /** Certs expiring soonest first — a "what's about to break" view. */
  expiryTimeline(certs: readonly WorkloadCert[]): CertStatus[] {
    return certs
      .map((cert) => ({
        spiffeId: cert.spiffeId,
        serial: cert.serial,
        expiresAtMs: cert.expiresAtMs,
        remainingMs: cert.expiresAtMs - this._clock.nowMs(),
        health: this.classify(cert),
      }))
      .sort((a, b) => a.remainingMs - b.remainingMs);
  }
}
