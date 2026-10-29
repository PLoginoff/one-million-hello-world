/**
 * SmsCodeProvider — stub implementation for SMS-delivered codes.
 *
 * Generates a numeric code, stores a hash with expiry, and lets a caller
 * "send" via an injected transport. Verification is constant-time.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

export interface SmsTransport {
  send(to: string, message: string): Promise<void>;
}

interface PendingSms {
  phoneHash: string;
  codeHash: string;
  salt: string;
  expiresAtMs: number;
  attempts: number;
}

export class SmsCodeProvider {
  private pending = new Map<string, PendingSms>();
  private readonly now: () => number;
  private readonly codeLength: number;
  private readonly ttlMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly transport: SmsTransport,
    opts: { now?: () => number; codeLength?: number; ttlMs?: number; maxAttempts?: number } = {}
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.codeLength = opts.codeLength ?? 6;
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.maxAttempts = opts.maxAttempts ?? 5;
  }

  /**
   * Generate and "send" a code to a phone number. Returns a challengeId
   * that must be presented alongside the code for verification.
   */
  async send(to: string): Promise<{ challengeId: string; expiresAtMs: number }> {
    const challengeId = `sms-${randomBytes(8).toString('hex')}`;
    const code = randomInt(0, Math.pow(10, this.codeLength))
      .toString()
      .padStart(this.codeLength, '0');
    const salt = randomBytes(8).toString('hex');
    const phoneHash = createHash('sha256').update(to).digest('hex');
    const codeHash = createHash('sha256').update(`${salt}:${code}`).digest('hex');
    const expiresAtMs = this.now() + this.ttlMs;
    this.pending.set(challengeId, {
      phoneHash,
      codeHash,
      salt,
      expiresAtMs,
      attempts: 0,
    });
    await this.transport.send(to, `Your verification code is ${code}`);
    return { challengeId, expiresAtMs };
  }

  /**
   * Verify a code for a challenge. Constant-time compare.
   */
  verify(challengeId: string, phone: string, code: string): boolean {
    const p = this.pending.get(challengeId);
    if (!p) return false;
    if (p.expiresAtMs <= this.now()) {
      this.pending.delete(challengeId);
      return false;
    }
    if (p.attempts >= this.maxAttempts) {
      this.pending.delete(challengeId);
      return false;
    }
    p.attempts++;
    const phoneHash = createHash('sha256').update(phone).digest('hex');
    if (phoneHash !== p.phoneHash) return false;
    const attempt = createHash('sha256').update(`${p.salt}:${code}`).digest('hex');
    const a = Buffer.from(attempt, 'utf8');
    const b = Buffer.from(p.codeHash, 'utf8');
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (match) {
      this.pending.delete(challengeId);
      return true;
    }
    return false;
  }

  /** Peek the pending-challenge count (test/debug). */
  get pendingCount(): number {
    return this.pending.size;
  }
}
