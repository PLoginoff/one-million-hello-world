/**
 * MfaEnrollment — authenticator-app pairing flow.
 *
 * Lifecycle:
 *   1. beginEnrollment(userId, label) → secret + otpauth URI (pending).
 *   2. confirmEnrollment(userId, code) → verifies first TOTP code to prove
 *      the user scanned the QR, then marks the factor 'active' and issues
 *      backup codes.
 */

import { randomBytes } from 'crypto';
import { Totp } from './Totp';
import { BackupCodes, BackupCodeEntry } from './BackupCodes';

export type MfaFactorStatus = 'pending' | 'active' | 'disabled';

export interface MfaFactor {
  id: string;
  userId: string;
  kind: 'totp' | 'sms' | 'backup';
  status: MfaFactorStatus;
  label: string;
  /** Only for totp factors — the raw secret bytes. */
  secret?: Buffer;
  secretBase32?: string;
  backupCodeEntries?: BackupCodeEntry[];
  enrolledAtMs: number;
  confirmedAtMs?: number;
  meta?: Record<string, unknown>;
}

export class MfaEnrollment {
  private factors = new Map<string, MfaFactor>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Begin TOTP enrollment — generates a secret and returns the otpauth URI.
   */
  beginTotp(
    userId: string,
    accountName: string,
    opts: { issuer?: string; label?: string } = {}
  ): { factorId: string; secretBase32: string; otpauthUri: string } {
    const { secret, base32 } = Totp.generateSecret();
    const factorId = `mfa-${randomBytes(8).toString('hex')}`;
    const uri = Totp.otpauthUri({
      secretBase32: base32,
      accountName,
      issuer: opts.issuer,
    });
    const factor: MfaFactor = {
      id: factorId,
      userId,
      kind: 'totp',
      status: 'pending',
      label: opts.label ?? `TOTP ${accountName}`,
      secret,
      secretBase32: base32,
      enrolledAtMs: this.now(),
    };
    this.factors.set(factorId, factor);
    return { factorId, secretBase32: base32, otpauthUri: uri };
  }

  /**
   * Confirm enrollment — verifies the first code the user produces.
   * Returns generated backup codes on success.
   */
  confirmTotp(
    factorId: string,
    code: string
  ): { confirmed: boolean; backupCodes?: string[] } {
    const f = this.factors.get(factorId);
    if (!f || f.kind !== 'totp' || !f.secret) {
      return { confirmed: false };
    }
    if (f.status !== 'pending') {
      return { confirmed: f.status === 'active' };
    }
    const res = Totp.verify(f.secret, code, this.now());
    if (!res.valid) return { confirmed: false };
    f.status = 'active';
    f.confirmedAtMs = this.now();
    // Issue a batch of backup codes
    const { codes, entries } = BackupCodes.generate(10);
    f.backupCodeEntries = entries;
    return { confirmed: true, backupCodes: codes };
  }

  /** Verify a TOTP code for an active factor. */
  verifyTotp(factorId: string, code: string): boolean {
    const f = this.factors.get(factorId);
    if (!f || f.kind !== 'totp' || f.status !== 'active' || !f.secret) return false;
    return Totp.verify(f.secret, code, this.now()).valid;
  }

  /** Verify a backup code for a factor (consumes it). */
  verifyBackupCode(factorId: string, code: string): boolean {
    const f = this.factors.get(factorId);
    if (!f || !f.backupCodeEntries) return false;
    const bc = new BackupCodes();
    bc.load(f.backupCodeEntries);
    return bc.validate(code, this.now());
  }

  /** Get factor state. */
  get(factorId: string): MfaFactor | null {
    const f = this.factors.get(factorId);
    if (!f) return null;
    return { ...f, secret: f.secret ? Buffer.from(f.secret) : undefined };
  }

  /** List a user's factors. */
  forUser(userId: string): MfaFactor[] {
    return Array.from(this.factors.values())
      .filter((f) => f.userId === userId)
      .map((f) => ({ ...f, secret: undefined, secretBase32: undefined }));
  }

  /** Disable a factor (e.g. on user request or admin action). */
  disable(factorId: string): boolean {
    const f = this.factors.get(factorId);
    if (!f || f.status === 'disabled') return false;
    f.status = 'disabled';
    return true;
  }

  /**
   * Decode an otpauth URI for preview purposes (no state change).
   */
  static describeOtpauthUri(uri: string) {
    return Totp.parseOtpauthUri(uri);
  }
}
