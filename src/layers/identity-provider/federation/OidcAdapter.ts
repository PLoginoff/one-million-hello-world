/**
 * OidcAdapter — OIDC-ish protocol adapter.
 *
 * Implements the IdP side of an authorization-code flow:
 *
 *   buildAuthorizationRequest()   — construct an outgoing request (SP-side
 *                                   helper, also used to round-trip in tests)
 *   parseAuthorizationRequest()   — validate an incoming request's
 *                                   structural soundness
 *   issueAuthorizationCode()      — after local authn, mint a code bound to
 *                                   (clientId, redirectUri, subject, nonce,
 *                                   PKCE challenge)
 *   exchangeCode()                — redeem a code for tokens; verifies
 *                                   client/redirect binding, expiry, and
 *                                   the PKCE verifier when a challenge was
 *                                   bound (S256: base64url(sha256(verifier)))
 *   buildIdToken()                — sign a claims set into a compact JWS-ish
 *                                   token (header.payload.signature, with
 *                                   the signature HMAC-stubbed via
 *                                   KeyResolver)
 *   parseIdToken()                — decode & verify an id_token
 *
 * This preserves OIDC's security semantics — redirect binding, code
 * single-use, PKCE proof-of-possession, nonce echo — without wire-level
 * OIDC fidelity.
 *
 * @module IdentityProvider/Federation
 */

import { createHash, randomBytes } from 'crypto';
import { KeyResolver } from './KeyResolver';
import {
  OidcAuthorizationRequest,
  OidcTokenResponse,
  OidcIdTokenClaims,
  FederationError,
  FederationErrorCode,
} from './types';

/** base64url helper (no padding). */
function b64u(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function b64uJson(value: unknown): string {
  return b64u(JSON.stringify(value));
}

interface AuthCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  subject: string;
  nonce?: string;
  codeChallenge?: string;
  scope: string[];
  expiresAt: number;
  used: boolean;
}

export class OidcAdapter {
  private readonly _keys: KeyResolver;
  private readonly _issuer: string;
  private readonly _codeTtlMs: number;
  private readonly _codes: Map<string, AuthCodeRecord> = new Map();

  constructor(keys: KeyResolver, issuer: string, codeTtlMs = 60_000) {
    this._keys = keys;
    this._issuer = issuer;
    this._codeTtlMs = codeTtlMs;
  }

  /** Construct an authorization request (SP-side helper). */
  buildAuthorizationRequest(input: {
    clientId: string;
    redirectUri: string;
    scope: string[];
    state?: string;
    nonce?: string;
    pkce?: boolean;
  }): OidcAuthorizationRequest {
    const req: OidcAuthorizationRequest = {
      responseType: 'code',
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scope: [...input.scope],
      state: input.state ?? randomBytes(12).toString('base64url'),
      nonce: input.nonce ?? randomBytes(12).toString('base64url'),
    };
    if (input.pkce) {
      const verifier = randomBytes(32).toString('base64url');
      req.codeChallenge = createHash('sha256').update(verifier).digest('base64url');
      req.codeChallengeMethod = 'S256';
      // Caller must retain the verifier — expose it via a side channel.
      (req as { _verifier?: string })._verifier = verifier;
    }
    return req;
  }

  /** Validate a received authorization request's shape. */
  parseAuthorizationRequest(raw: Record<string, unknown>): OidcAuthorizationRequest {
    const str = (k: string): string => {
      const v = raw[k];
      if (typeof v !== 'string' || v.length === 0) {
        throw new FederationError(FederationErrorCode.BAD_REQUEST, `missing/invalid ${k}`);
      }
      return v;
    };
    const scope = raw.scope;
    if (!Array.isArray(scope) || scope.some((s) => typeof s !== 'string')) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'scope must be string[]');
    }
    return {
      responseType: 'code',
      clientId: str('clientId'),
      redirectUri: str('redirectUri'),
      scope: scope as string[],
      state: typeof raw.state === 'string' ? raw.state : undefined,
      nonce: typeof raw.nonce === 'string' ? raw.nonce : undefined,
      codeChallenge: typeof raw.codeChallenge === 'string' ? raw.codeChallenge : undefined,
      codeChallengeMethod: raw.codeChallengeMethod === 'S256' ? 'S256' : undefined,
    };
  }

  /**
   * Issue an authorization code after successful local authentication.
   * Codes are single-use and expire after `codeTtlMs`.
   */
  issueAuthorizationCode(
    request: OidcAuthorizationRequest,
    subject: string,
    now: number = Date.now()
  ): string {
    const code = `code_${randomBytes(24).toString('base64url')}`;
    this._codes.set(code, {
      code,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      subject,
      nonce: request.nonce,
      codeChallenge: request.codeChallenge,
      scope: [...request.scope],
      expiresAt: now + this._codeTtlMs,
      used: false,
    });
    return code;
  }

  /**
   * Exchange an authorization code for tokens.
   *
   * @param verifier PKCE verifier — required iff the code was issued
   *                 with a code_challenge.
   */
  exchangeCode(
    code: string,
    clientId: string,
    redirectUri: string,
    verifier?: string,
    now: number = Date.now()
  ): OidcTokenResponse {
    const rec = this._codes.get(code);
    if (!rec || rec.used) {
      throw new FederationError(FederationErrorCode.TOKEN_INVALID, 'invalid or consumed authorization code');
    }
    if (now >= rec.expiresAt) {
      throw new FederationError(FederationErrorCode.TOKEN_INVALID, 'authorization code expired');
    }
    if (rec.clientId !== clientId || rec.redirectUri !== redirectUri) {
      throw new FederationError(FederationErrorCode.STATE_MISMATCH, 'client_id/redirect_uri mismatch');
    }
    if (rec.codeChallenge !== undefined) {
      if (verifier === undefined) {
        throw new FederationError(FederationErrorCode.BAD_REQUEST, 'PKCE verifier required');
      }
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (challenge !== rec.codeChallenge) {
        throw new FederationError(FederationErrorCode.STATE_MISMATCH, 'PKCE verification failed');
      }
    }
    rec.used = true;
    this._codes.delete(code);

    const claims: OidcIdTokenClaims = {
      iss: this._issuer,
      sub: rec.subject,
      aud: clientId,
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + 3600_000) / 1000),
      ...(rec.nonce !== undefined ? { nonce: rec.nonce } : {}),
    };
    return {
      accessToken: `at_${randomBytes(24).toString('base64url')}`,
      idToken: this.buildIdToken(claims, now),
      tokenType: 'Bearer',
      expiresIn: 3600,
      refreshToken: `rt_${randomBytes(24).toString('base64url')}`,
    };
  }

  /**
   * Build a compact JWS-ish ID token: base64url(header).base64url(payload).hex(hmac).
   */
  buildIdToken(claims: OidcIdTokenClaims, now: number = Date.now()): string {
    const header = { alg: 'HS256-stub', typ: 'JWT' };
    const body = `${b64uJson(header)}.${b64uJson(claims)}`;
    const sig = this._keys.sign(this._issuer, 'HS256-stub', body, now);
    return `${body}.${sig.value}`;
  }

  /** Decode and verify an id_token issued by `buildIdToken`. */
  parseIdToken(token: string, expectedAudience?: string, now: number = Date.now()): OidcIdTokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new FederationError(FederationErrorCode.TOKEN_INVALID, 'malformed id_token');
    }
    const body = `${parts[0]}.${parts[1]}`;
    // Resolve the issuer's keys: we need `iss` first, so decode payload unsigned.
    let claims: OidcIdTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as OidcIdTokenClaims;
    } catch {
      throw new FederationError(FederationErrorCode.TOKEN_INVALID, 'malformed id_token payload');
    }
    const kid = this._keys.resolveForSign(claims.iss).kid;
    if (!this._keys.verify(claims.iss, kid, body, parts[2], now)) {
      throw new FederationError(FederationErrorCode.INVALID_SIGNATURE, 'id_token signature invalid');
    }
    if (now / 1000 > claims.exp + 60) {
      throw new FederationError(FederationErrorCode.ASSERTION_EXPIRED, 'id_token expired');
    }
    if (expectedAudience !== undefined && claims.aud !== expectedAudience) {
      throw new FederationError(FederationErrorCode.AUDIENCE_MISMATCH, 'id_token audience mismatch');
    }
    return claims;
  }
}
