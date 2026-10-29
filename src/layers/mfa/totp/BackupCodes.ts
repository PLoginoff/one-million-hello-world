/**
 * BackupCodes — single-use recovery codes for when the user loses their
 * second factor. Codes are stored hashed (SHA-256 + per-code salt), so
 * a database leak does not expose usable codes.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface BackupCodeEntry {
  hash: string;
  salt: string;
  used: boolean;
  usedAtMs?: number;
}

export class BackupCodes {
  private entries: BackupCodeEntry[] = [];

  /**
   * Generate a batch of fresh codes. Returns the raw codes ONCE — store
   * only the hashed entries.
   */
  static generate(count = 10, length = 10): { codes: string[]; entries: BackupCodeEntry[] } {
    const codes: string[] = [];
    const entries: BackupCodeEntry[] = [];
    for (let i = 0; i < count; i++) {
      // Codes like "AB12-CD34-EF56" — unambiguous charset
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const raw = randomBytes(length);
      let code = '';
      for (let j = 0; j < length; j++) {
        code += alphabet[raw[j] % alphabet.length];
        if (j === 4) code += '-';
      }
      const salt = randomBytes(8).toString('hex');
      codes.push(code);
      entries.push({
        hash: BackupCodes.hashCode(code, salt),
        salt,
        used: false,
      });
    }
    return { codes, entries };
  }

  /** Load pre-hashed entries into this validator. */
  load(entries: BackupCodeEntry[]): void {
    this.entries = entries.slice();
  }

  /** Current un-used code count. */
  get remaining(): number {
    return this.entries.filter((e) => !e.used).length;
  }

  /**
   * Validate a user-supplied code. Consumes it on success.
   * Returns true if valid.
   */
  validate(code: string, nowMs: number = Date.now()): boolean {
    const normalised = code.trim().toUpperCase();
    for (const e of this.entries) {
      if (e.used) continue;
      const h = BackupCodes.hashCode(normalised, e.salt);
      const a = Buffer.from(h, 'utf8');
      const b = Buffer.from(e.hash, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        e.used = true;
        e.usedAtMs = nowMs;
        return true;
      }
    }
    return false;
  }

  /** Whether any codes remain. */
  hasCodes(): boolean {
    return this.remaining > 0;
  }

  /** Mark a code used by index (admin). */
  markUsed(index: number): boolean {
    const e = this.entries[index];
    if (!e || e.used) return false;
    e.used = true;
    return true;
  }

  static hashCode(code: string, salt: string): string {
    return createHash('sha256')
      .update(`${salt}:${code.trim().toUpperCase()}`)
      .digest('hex');
  }
}
