/**
 * SecureRandom — CSPRNG helpers.
 */

import { randomBytes, randomInt, randomUUID } from 'crypto';
import { CryptoError } from './types';

export class SecureRandom {
  /** `n` cryptographically secure random bytes. */
  static bytes(n: number): Buffer {
    if (n <= 0 || n > 1_000_000) {
      throw new CryptoError('invalid_format', `Invalid byte count ${n}`);
    }
    return randomBytes(n);
  }

  /** Hex string of `bytes` random bytes. */
  static hex(bytes = 32): string {
    return this.bytes(bytes).toString('hex');
  }

  /** Base64url string of `bytes` random bytes. */
  static base64url(bytes = 32): string {
    return this.bytes(bytes).toString('base64url');
  }

  /** Random integer in [min, maxExclusive). */
  static int(min: number, maxExclusive: number): number {
    if (min >= maxExclusive) {
      throw new CryptoError('invalid_format', `Invalid range [${min}, ${maxExclusive})`);
    }
    return randomInt(min, maxExclusive);
  }

  /** Random alphanumeric string of given length. */
  static alphanum(length: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);
    let s = '';
    for (let i = 0; i < length; i++) {
      s += alphabet[bytes[i] % alphabet.length];
    }
    return s;
  }

  /** UUIDv4. */
  static uuid(): string {
    return randomUUID();
  }

  /** Numeric code of `digits` length (0-padded) — for SMS / PIN codes. */
  static numericCode(digits = 6): string {
    const max = Math.pow(10, digits);
    return randomInt(0, max).toString().padStart(digits, '0');
  }
}
