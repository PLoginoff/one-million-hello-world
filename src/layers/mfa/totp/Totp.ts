/**
 * TOTP — Time-based One-Time Password (RFC 6238).
 *
 * totp(secret, timestamp, opts) → numeric code valid for a time-step.
 * Verification allows a ±window tolerance (default ±1 step = 30s).
 */

import { randomBytes } from 'crypto';
import { base32Decode, base32Encode } from './Base32';
import { hotp, hotpVerify, HotpAlgorithm } from './Hotp';

export interface TotpOptions {
  /** Time step in seconds (default 30 — RFC 6238 recommends 30). */
  stepSeconds?: number;
  /** Digits in the code (default 6). */
  digits?: number;
  /** HMAC algorithm (default sha1 per RFC 6238). */
  algorithm?: HotpAlgorithm;
  /** Epoch offset in seconds (default 0 = unix epoch). */
  t0?: number;
}

export interface TotpVerifyResult {
  valid: boolean;
  /** Time-step delta at which the code matched (0 = current step). */
  delta?: number;
}

export class Totp {
  /** Generate a TOTP code for a given timestamp (ms). */
  static generate(secret: Buffer, timestampMs: number, opts: TotpOptions = {}): string {
    const step = opts.stepSeconds ?? 30;
    const t0 = opts.t0 ?? 0;
    const counter = Math.floor((timestampMs / 1000 - t0) / step);
    return hotp(secret, counter, {
      algorithm: opts.algorithm,
      digits: opts.digits ?? 6,
    });
  }

  /**
   * Verify a user-supplied code against the current time with ±window
   * tolerance (default ±1 step).
   */
  static verify(
    secret: Buffer,
    code: string,
    timestampMs: number,
    opts: TotpOptions & { window?: number } = {}
  ): TotpVerifyResult {
    const step = opts.stepSeconds ?? 30;
    const t0 = opts.t0 ?? 0;
    const window = opts.window ?? 1;
    const counter = Math.floor((timestampMs / 1000 - t0) / step);
    const start = Math.max(0, counter - window);

    const matched = hotpVerify(secret, start, code, {
      algorithm: opts.algorithm,
      digits: opts.digits ?? 6,
      lookAhead: counter - start + window,
    });
    if (matched === -1) return { valid: false };
    return { valid: true, delta: matched - counter };
  }

  /**
   * Generate a fresh random secret (160 bits → 32-char base32).
   */
  static generateSecret(bytes = 20): { secret: Buffer; base32: string } {
    const secret = randomBytes(bytes);
    return { secret, base32: base32Encode(secret) };
  }

  /**
   * Build an `otpauth://` URI for authenticator-app pairing.
   */
  static otpauthUri(opts: {
    secretBase32: string;
    accountName: string;
    issuer?: string;
    algorithm?: HotpAlgorithm;
    digits?: number;
    period?: number;
  }): string {
    const label = opts.issuer
      ? `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.accountName)}`
      : encodeURIComponent(opts.accountName);
    const params = new URLSearchParams();
    params.set('secret', opts.secretBase32);
    if (opts.issuer) params.set('issuer', opts.issuer);
    if (opts.algorithm && opts.algorithm !== 'sha1') {
      params.set('algorithm', opts.algorithm.toUpperCase().replace('SHA', 'SHA-'));
    }
    if (opts.digits && opts.digits !== 6) params.set('digits', String(opts.digits));
    if (opts.period && opts.period !== 30) params.set('period', String(opts.period));
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /**
   * Parse an `otpauth://` URI back into its parameters.
   */
  static parseOtpauthUri(uri: string): {
    type: 'totp' | 'hotp';
    label: string;
    secret: Buffer;
    issuer?: string;
    algorithm: HotpAlgorithm;
    digits: number;
    period: number;
    counter?: number;
  } | null {
    let u: URL;
    try {
      u = new URL(uri);
    } catch {
      return null;
    }
    if (u.protocol !== 'otpauth:') return null;
    const type = u.hostname.toLowerCase() === 'hotp' ? 'hotp' : 'totp';
    const label = decodeURIComponent(u.pathname.replace(/^\//, ''));
    const secretParam = u.searchParams.get('secret');
    if (!secretParam) return null;
    let secret: Buffer;
    try {
      secret = base32Decode(secretParam);
    } catch {
      return null;
    }
    const issuer = u.searchParams.get('issuer') ?? undefined;
    const algParam = (u.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
    const algorithm: HotpAlgorithm =
      algParam === 'SHA256' ? 'sha256' : algParam === 'SHA512' ? 'sha512' : 'sha1';
    const digits = parseInt(u.searchParams.get('digits') ?? '6', 10);
    const period = parseInt(u.searchParams.get('period') ?? '30', 10);
    const counterStr = u.searchParams.get('counter');
    const counter = counterStr !== null ? parseInt(counterStr, 10) : undefined;
    return { type, label, secret, issuer, algorithm, digits, period, counter };
  }
}
