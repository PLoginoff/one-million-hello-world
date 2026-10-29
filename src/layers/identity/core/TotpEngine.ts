/**
 * TotpEngine — RFC 6238 TOTP second-factor verification.
 *
 * Real TOTP: HMAC-SHA1(secret, floor((t - t0) / step)) truncated to a
 * 6-8 digit code via dynamic truncation (RFC 4226 §5.3).
 *
 *  - `generateSecret` returns base32-encoded keying material (no
 *    external deps — base32 implemented locally).
 *  - `totp` computes the code for a time step.
 *  - `verify` accepts a window of ±`window` steps to tolerate clock
 *    drift, and returns the matched step so callers can reject replay
 *    of the same code within its validity window.
 *
 * Replay protection: callers store the last accepted step per user;
 * `verify` reports which step matched so a code can't be reused inside
 * its own window.
 *
 * @module Identity/Core
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as RFC 4648 base32 (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decode base32 (case-insensitive, ignores whitespace/hyphens). */
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP dynamic truncation (RFC 4226 §5.3). */
function truncate(hmac: Buffer, digits: number): number {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return code % Math.pow(10, digits);
}

export interface TotpOptions {
  /** Time step seconds (default 30). */
  stepSeconds?: number;
  /** Code digits (default 6). */
  digits?: number;
  /** Steps of drift tolerated each side (default 1). */
  window?: number;
}

export class TotpEngine {
  private readonly _step: number;
  private readonly _digits: number;
  private readonly _window: number;

  constructor(opts?: TotpOptions) {
    this._step = opts?.stepSeconds ?? 30;
    this._digits = opts?.digits ?? 6;
    this._window = opts?.window ?? 1;
  }

  /** New random secret (20 bytes) in base32 — safe for otpauth:// URIs. */
  generateSecret(): string {
    return base32Encode(randomBytes(20));
  }

  /** TOTP code for `timestampMs` (or a specific step index). */
  totp(secretB32: string, timestampMs: number): string {
    const counter = Math.floor(timestampMs / 1000 / this._step);
    return this._hotp(secretB32, counter);
  }

  /** HOTP at an explicit counter value. */
  private _hotp(secretB32: string, counter: number): string {
    const key = base32Decode(secretB32);
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const mac = createHmac('sha1', key).update(msg).digest();
    return truncate(mac, this._digits).toString().padStart(this._digits, '0');
  }

  /**
   * Verify a user-supplied code. Returns the matched step index on
   * success (so the caller can store it and reject reuse inside the
   * same step), or -1 on failure. Constant-time per step comparison.
   */
  verify(secretB32: string, code: string, timestampMs: number, lastAcceptedStep = -1): number {
    const nowStep = Math.floor(timestampMs / 1000 / this._step);
    for (let i = -this._window; i <= this._window; i++) {
      const step = nowStep + i;
      if (step <= lastAcceptedStep) continue; // already-used step: replay
      const expected = this._hotp(secretB32, step);
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(code, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return step;
      }
    }
    return -1;
  }

  /** otpauth:// URI for authenticator-app enrollment. */
  otpauthUri(secretB32: string, accountName: string, issuer: string): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
    return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&digits=${this._digits}&period=${this._step}`;
  }
}
