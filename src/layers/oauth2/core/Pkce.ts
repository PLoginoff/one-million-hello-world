/**
 * PKCE helpers — RFC 7636.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export type CodeChallengeMethod = 'S256' | 'plain';

export class Pkce {
  /**
   * Generate a high-entropy code_verifier.
   * Spec: 43–128 chars from [A-Z a-z 0-9 -._~]. We use 64 url-safe bytes
   * → ~86 chars of entropy.
   */
  static generateVerifier(length = 64): string {
    if (length < 32 || length > 96) {
      throw new Error('code_verifier length must be between 32 and 96 bytes');
    }
    return randomBytes(length).toString('base64url');
  }

  /**
   * Derive code_challenge from a verifier.
   * S256: BASE64URL(SHA256(verifier)).
   * plain: the verifier itself.
   */
  static challenge(verifier: string, method: CodeChallengeMethod = 'S256'): string {
    if (method === 'plain') return verifier;
    return createHash('sha256').update(verifier, 'utf8').digest('base64url');
  }

  /**
   * Verify that a verifier produces the stored challenge.
   * Uses constant-time comparison.
   */
  static verify(
    verifier: string,
    challenge: string,
    method: CodeChallengeMethod
  ): boolean {
    if (!verifier || verifier.length < 43 || verifier.length > 128) {
      return false;
    }
    const computed = this.challenge(verifier, method);
    const a = Buffer.from(computed, 'utf8');
    const b = Buffer.from(challenge, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Validate a verifier's character set per RFC 7636 §4.1.
   * Allowed: ALPHA / DIGIT / "-" / "." / "_" / "~"
   */
  static isValidVerifier(verifier: string): boolean {
    if (verifier.length < 43 || verifier.length > 128) return false;
    return /^[A-Za-z0-9\-._~]+$/.test(verifier);
  }
}
