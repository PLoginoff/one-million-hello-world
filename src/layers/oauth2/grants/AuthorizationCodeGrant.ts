/**
 * Authorization Code grant — RFC 6749 §4.1 (+ PKCE RFC 7636).
 *
 * Models the flow as a state machine:
 *   START → CODE_ISSUED → (PKCE verified) → TOKEN_ISSUED → END
 *        ↘ ERROR (redirect mismatch, expiry, replay)
 */

import { randomBytes } from 'crypto';
import { ClientRegistry } from '../core/ClientRegistry';
import { Pkce } from '../core/Pkce';
import { TokenStore } from '../core/TokenStore';
import {
  AuthorizationCode,
  OAuth2Error,
  scopeToString,
  TokenResponse,
  parseScope,
} from '../core/types';

export type AuthCodeFlowState =
  | 'START'
  | 'CODE_ISSUED'
  | 'TOKEN_ISSUED'
  | 'ERROR'
  | 'END';

export interface AuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  /** PKCE */
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
  /** Subject performing the authorisation (normally from session). */
  subject: string;
  /** OIDC nonce */
  nonce?: string;
}

export interface AuthorizeResponse {
  redirectUri: string;
  code: string;
  state?: string;
}

export interface TokenExchangeRequest {
  grant_type: 'authorization_code';
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret?: string;
  /** PKCE verifier */
  code_verifier?: string;
}

export class AuthorizationCodeGrant {
  private readonly codeTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly clients: ClientRegistry,
    private readonly tokens: TokenStore,
    opts: { now?: () => number; codeTtlMs?: number } = {}
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.codeTtlMs = opts.codeTtlMs ?? 60_000; // codes expire in 60s
  }

  /**
   * Authorization endpoint — validates request, issues a code.
   */
  authorize(req: AuthorizeRequest): AuthorizeResponse {
    if (req.response_type !== 'code') {
      throw new OAuth2Error(
        'unsupported_response_type',
        `response_type must be 'code', got '${req.response_type}'`
      );
    }
    const client = this.clients.get(req.client_id);
    this.clients.assertGrantAllowed(req.client_id, 'authorization_code');
    this.clients.validateRedirectUri(req.client_id, req.redirect_uri);

    const requestedScopes = parseScope(req.scope);
    this.clients.assertScopesAllowed(req.client_id, requestedScopes);

    // PKCE handling
    if (client.requirePkce && !req.code_challenge) {
      throw new OAuth2Error(
        'invalid_request',
        'code_challenge required (client enforces PKCE)'
      );
    }
    if (req.code_challenge) {
      const method = req.code_challenge_method ?? 'plain';
      if (method === 'S256' && !Pkce.isValidVerifier(req.code_challenge)) {
        // challenge must itself look like a verifier
        if (req.code_challenge.length < 43) {
          throw new OAuth2Error('invalid_request', 'code_challenge too short');
        }
      }
      if (method !== 'S256' && method !== 'plain') {
        throw new OAuth2Error(
          'invalid_request',
          `Unsupported code_challenge_method: ${String(method)}`
        );
      }
    }

    const code: AuthorizationCode = {
      code: `ac-${randomBytes(24).toString('hex')}`,
      clientId: req.client_id,
      redirectUri: req.redirect_uri,
      scope: requestedScopes,
      subject: req.subject,
      expiresAtMs: this.now() + this.codeTtlMs,
      codeChallenge: req.code_challenge,
      codeChallengeMethod: req.code_challenge_method ?? 'plain',
      nonce: req.nonce,
      used: false,
    };
    this.tokens.storeCode(code);

    return {
      redirectUri: `${req.redirect_uri}?code=${encodeURIComponent(code.code)}${
        req.state ? `&state=${encodeURIComponent(req.state)}` : ''
      }`,
      code: code.code,
      state: req.state,
    };
  }

  /**
   * Token endpoint — exchange code for tokens.
   */
  exchange(req: TokenExchangeRequest): TokenResponse {
    if (req.grant_type !== 'authorization_code') {
      throw new OAuth2Error(
        'unsupported_grant_type',
        `Expected authorization_code, got ${req.grant_type}`
      );
    }
    this.clients.authenticate(req.client_id, req.client_secret);
    this.clients.assertGrantAllowed(req.client_id, 'authorization_code');

    const code = this.tokens.consumeCode(req.code);

    if (code.clientId !== req.client_id) {
      throw new OAuth2Error('invalid_grant', 'Code was not issued to this client');
    }
    if (code.redirectUri !== req.redirect_uri) {
      throw new OAuth2Error('invalid_grant', 'redirect_uri mismatch');
    }

    // PKCE verify
    if (code.codeChallenge) {
      if (!req.code_verifier) {
        throw new OAuth2Error('invalid_grant', 'code_verifier required');
      }
      const method = code.codeChallengeMethod ?? 'plain';
      if (!Pkce.verify(req.code_verifier, code.codeChallenge, method)) {
        throw new OAuth2Error('invalid_grant', 'code_verifier mismatch');
      }
    }

    const client = this.clients.get(req.client_id);
    const at = this.tokens.mintAccessToken({
      clientId: req.client_id,
      subject: code.subject,
      scope: code.scope,
      ttlSeconds: client.accessTokenTtlSeconds,
    });

    let refresh: string | undefined;
    if (client.refreshTokenTtlSeconds !== undefined && client.allowedGrantTypes.includes('refresh_token')) {
      const rt = this.tokens.mintRefreshToken({
        clientId: req.client_id,
        subject: code.subject,
        scope: code.scope,
        ttlSeconds: client.refreshTokenTtlSeconds,
      });
      refresh = rt.token;
    }

    const resp: TokenResponse = {
      access_token: at.token,
      token_type: 'Bearer',
      expires_in: client.accessTokenTtlSeconds,
      scope: code.scope.length ? scopeToString(code.scope) : undefined,
    };
    if (refresh) resp.refresh_token = refresh;
    return resp;
  }
}
