/**
 * TokenBinding — RFC 8700 `cnf` (confirmation) claim verification.
 *
 * Sender-constrained tokens embed a proof-of-possession binding in `cnf`:
 *
 *   cnf = {
 *     "jkt":     <base64url SHA-256 thumbprint of the client's JWK>,
 *     "x5t#S256": <base64url SHA-256 thumbprint of the client cert>,
 *     "kid":     <key id the holder must sign proof with>
 *   }
 *
 * Verification recomputes the thumbprint of the presented key material
 * and compares it (constant-time-ish) against the claim:
 *
 *  - `jkt` → RFC 7638 JWK thumbprint: SHA-256 over the lexicographically
 *    sorted required members (kty + type-specific params), base64url'd.
 *  - `x5t#S256` → SHA-256 over the DER certificate, base64url'd.
 *
 * A token with NO `cnf` claim is a plain bearer token — `verify` returns
 * 'bearer' so the caller can decide whether bearer tokens are acceptable.
 *
 * @module JwtValidationLayer/Engine2
 */

import { createHash } from 'crypto';
import { JsonWebKeyObject } from '../jwt/types';
import { TokenClaims2 } from './types';

/** JWK members included in the RFC 7638 thumbprint, per kty. */
const THUMBPRINT_MEMBERS: Record<string, readonly string[]> = {
  RSA: ['e', 'kty', 'n'],
  EC: ['crv', 'kty', 'x', 'y'],
  OKP: ['crv', 'kty', 'x'],
  oct: ['k', 'kty'],
};

export type BindingOutcome =
  | { readonly kind: 'bound'; readonly method: 'jkt' | 'x5t#S256' | 'kid' }
  | { readonly kind: 'bearer' }
  | { readonly kind: 'mismatch'; readonly expected: string; readonly actual: string }
  | { readonly kind: 'unverifiable'; readonly reason: string };

function sha256b64url(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('base64url');
}

/** Compute the RFC 7638 JWK thumbprint (SHA-256, base64url). */
export function jwkThumbprint(jwk: JsonWebKeyObject): string | null {
  const members = THUMBPRINT_MEMBERS[jwk.kty];
  if (!members) return null;
  const obj: Record<string, string> = {};
  for (const m of members) {
    const v = jwk[m];
    if (typeof v !== 'string') return null;
    obj[m] = v;
  }
  // RFC 7638: JSON with lexicographically ordered keys, no whitespace.
  const canonical = `{${members
    .slice()
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`)
    .join(',')}}`;
  return sha256b64url(canonical);
}

export interface PresentedProof {
  /** Client's JWK (for jkt-bound tokens). */
  readonly jwk?: JsonWebKeyObject;
  /** DER-encoded client certificate (for x5t#S256-bound tokens). */
  readonly certDer?: Buffer;
  /** Key id used by the holder's proof signature. */
  readonly kid?: string;
}

export class TokenBinding {
  /**
   * Verify a token's cnf claim against presented proof material.
   * Precedence: jkt > x5t#S256 > kid (strongest binding first).
   */
  verify(claims: TokenClaims2, proof: PresentedProof): BindingOutcome {
    const cnf = claims.cnf;
    if (!cnf) return { kind: 'bearer' };

    if (cnf.jkt !== undefined) {
      if (!proof.jwk) {
        return { kind: 'unverifiable', reason: 'token requires jkt proof; no JWK presented' };
      }
      const actual = jwkThumbprint(proof.jwk);
      if (actual === null) {
        return { kind: 'unverifiable', reason: `unsupported kty '${proof.jwk.kty}' for thumbprint` };
      }
      return actual === cnf.jkt
        ? { kind: 'bound', method: 'jkt' }
        : { kind: 'mismatch', expected: cnf.jkt, actual };
    }

    if (cnf['x5t#S256'] !== undefined) {
      if (!proof.certDer) {
        return { kind: 'unverifiable', reason: 'token requires x5t#S256 proof; no cert presented' };
      }
      const actual = sha256b64url(proof.certDer);
      return actual === cnf['x5t#S256']
        ? { kind: 'bound', method: 'x5t#S256' }
        : { kind: 'mismatch', expected: cnf['x5t#S256'], actual };
    }

    if (cnf.kid !== undefined) {
      if (proof.kid === undefined) {
        return { kind: 'unverifiable', reason: 'token requires kid proof; none presented' };
      }
      return proof.kid === cnf.kid
        ? { kind: 'bound', method: 'kid' }
        : { kind: 'mismatch', expected: cnf.kid, actual: proof.kid };
    }

    return { kind: 'unverifiable', reason: 'cnf claim present but carries no known binding method' };
  }

  /** Convenience: is this proof sufficient for the token? */
  isBound(claims: TokenClaims2, proof: PresentedProof): boolean {
    const out = this.verify(claims, proof);
    return out.kind === 'bound' || out.kind === 'bearer';
  }
}
