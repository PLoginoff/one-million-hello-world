/**
 * OidcFlow — OIDC authorization-code flow stub.
 *
 * Builds authorization URLs, validates the callback state + nonce, and
 * decodes (without verifying) the id_token for claim extraction. Real
 * signature verification is delegated to the jwt-validation layer.
 */

import { createHash, randomBytes } from 'crypto';
import {
  IdentityProvider,
  OidcIdTokenClaims,
  OidcTokens,
  SsoFederationError,
} from './types';

export interface OidcAuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier?: string;
}

export interface OidcFlowOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope?: string;
  /** Optional token endpoint override for testing. */
  tokenEndpoint?: string;
  /** Inject a token-exchange transport (default: throws — stub). */
  exchangeCode?: (req: {
    code: string;
    clientId: string;
    redirectUri: string;
    tokenEndpoint: string;
    codeVerifier?: string;
    clientSecret?: string;
  }) => Promise<OidcTokens>;
}

function base64urlDecode(input: string): Buffer {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const r = b64.length % 4;
  if (r === 2) b64 += '==';
  else if (r === 3) b64 += '=';
  else if (r === 1) throw new Error('invalid base64url');
  return Buffer.from(b64, 'base64');
}

export class OidcFlow {
  private readonly cfg: Required<Pick<OidcFlowOptions, 'clientId' | 'redirectUri' | 'scope'>> &
    OidcFlowOptions;
  private readonly now: () => number;

  constructor(
    private readonly idp: IdentityProvider,
    opts: OidcFlowOptions,
    extras: { now?: () => number } = {}
  ) {
    if (idp.protocol !== 'oidc') {
      throw new SsoFederationError('unsupported_protocol', `IdP ${idp.id} is not OIDC`);
    }
    this.cfg = { scope: 'openid profile email', ...opts };
    this.now = extras.now ?? (() => Date.now());
  }

  /**
   * Build the authorization URL the user agent should be redirected to.
   * Returns the URL plus the state/nonce (and PKCE verifier if used) the
   * caller must persist for the callback.
   */
  startAuthorization(opts: { usePkce?: boolean; extraParams?: Record<string, string> } = {}): OidcAuthorizationRequest {
    const state = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cfg.clientId,
      redirect_uri: this.cfg.redirectUri,
      scope: this.cfg.scope,
      state,
      nonce,
    });
    let codeVerifier: string | undefined;
    if (opts.usePkce !== false) {
      codeVerifier = randomBytes(48).toString('base64url');
      const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
    }
    if (opts.extraParams) {
      for (const [k, v] of Object.entries(opts.extraParams)) params.set(k, v);
    }
    const sep = this.idp.ssoUrl.includes('?') ? '&' : '?';
    return {
      url: `${this.idp.ssoUrl}${sep}${params.toString()}`,
      state,
      nonce,
      codeVerifier,
    };
  }

  /**
   * Validate the callback state and exchange the code for tokens.
   * The default exchange transport throws — inject `exchangeCode` for
   * tests or a real HTTP client.
   */
  async handleCallback(input: {
    code: string;
    state: string;
    expectedState: string;
    nonce: string;
    codeVerifier?: string;
  }): Promise<{ tokens: OidcTokens; claims: OidcIdTokenClaims }> {
    if (input.state !== input.expectedState) {
      throw new SsoFederationError('invalid_request', 'state mismatch — possible CSRF', {
        expected: input.expectedState,
        got: input.state,
      });
    }
    const exchange =
      this.cfg.exchangeCode ??
      (() => Promise.reject(new SsoFederationError('unsupported_protocol', 'No token-exchange transport configured')));
    const tokens = await exchange({
      code: input.code,
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      redirectUri: this.cfg.redirectUri,
      tokenEndpoint: this.cfg.tokenEndpoint ?? `${this.idp.ssoUrl.replace(/\/authorize.*$/, '')}/token`,
      codeVerifier: input.codeVerifier,
    });
    const claims = OidcFlow.decodeIdToken(tokens.id_token);
    this.validateClaims(claims, input.nonce);
    return { tokens, claims };
  }

  /**
   * Decode an ID token's payload without verifying the signature.
   * Use the jwt-validation layer for real verification.
   */
  static decodeIdToken(idToken: string): OidcIdTokenClaims {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new SsoFederationError('invalid_assertion', 'id_token is not a JWT');
    }
    let raw: unknown;
    try {
      raw = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
    } catch {
      throw new SsoFederationError('invalid_assertion', 'id_token payload is not JSON');
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new SsoFederationError('invalid_assertion', 'id_token payload is not an object');
    }
    return raw as OidcIdTokenClaims;
  }

  private validateClaims(claims: OidcIdTokenClaims, expectedNonce: string): void {
    const nowSec = Math.floor(this.now() / 1000);
    if (claims.exp <= nowSec) {
      throw new SsoFederationError('assertion_expired', 'id_token expired', { exp: claims.exp });
    }
    if (claims.iat > nowSec + 60) {
      throw new SsoFederationError('assertion_not_yet_valid', 'id_token issued in the future');
    }
    if (claims.iss !== this.idp.entityId) {
      throw new SsoFederationError('invalid_assertion', `issuer mismatch: ${claims.iss}`, {
        expected: this.idp.entityId,
      });
    }
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(this.cfg.clientId)) {
      throw new SsoFederationError('audience_mismatch', 'id_token audience does not include client_id', {
        aud: claims.aud,
      });
    }
    if (claims.nonce !== expectedNonce) {
      throw new SsoFederationError('invalid_assertion', 'nonce mismatch');
    }
  }
}
