/**
 * HOTP — HMAC-based One-Time Password (RFC 4226).
 *
 * hotp(secret, counter, digits) → numeric code derived from HMAC(secret, counter).
 */

import { createHmac } from 'crypto';

export type HotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

export interface HotpOptions {
  /** Digest algorithm. RFC 4226 mandates SHA-1; SHA-256/512 for hardening. */
  algorithm?: HotpAlgorithm;
  /** Number of digits in the code (6-8 typical). */
  digits?: number;
}

/**
 * Compute an HOTP code for a moving counter.
 */
export function hotp(
  secret: Buffer,
  counter: number | bigint,
  opts: HotpOptions = {}
): string {
  const algorithm = opts.algorithm ?? 'sha1';
  const digits = opts.digits ?? 6;
  if (digits < 4 || digits > 10) {
    throw new Error('digits must be between 4 and 10');
  }
  if (counter < 0) {
    throw new Error('counter must be non-negative');
  }

  // 8-byte big-endian counter
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac(algorithm, secret).update(buf).digest();

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const mod = Math.pow(10, digits);
  return (code % mod).toString().padStart(digits, '0');
}

/**
 * Verify an HOTP code against a counter with look-ahead window.
 * Returns the counter that matched (>= input counter) or -1.
 */
export function hotpVerify(
  secret: Buffer,
  counter: number,
  code: string,
  opts: HotpOptions & { lookAhead?: number } = {}
): number {
  const lookAhead = opts.lookAhead ?? 10;
  for (let i = 0; i <= lookAhead; i++) {
    const candidate = hotp(secret, counter + i, opts);
    if (constantTimeEqual(candidate, code)) {
      return counter + i;
    }
  }
  return -1;
}

/** Constant-time string compare (safe for equal-length numeric codes). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // Compare anyway to avoid length oracle
    const dummy = Buffer.alloc(ba.length);
    ba.forEach((v, i) => (dummy[i] = v ^ 0xff));
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ba.length; i++) {
    diff |= ba[i] ^ bb[i];
  }
  return diff === 0;
}
