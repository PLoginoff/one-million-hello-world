/**
 * AuthorizeRequestValidator — defense-in-depth checks for /authorize
 * requests before a code is ever minted.
 *
 * Open redirector hardening (the #1 OAuth vulnerability class):
 *  - redirect_uri must match a registered URI *exactly* (no prefix
 *    matching — RFC 6749 §3.1.2.2 warns against substring matching).
 *  - when only ONE redirect_uri is registered and the request omits it,
 *    the registered one is used (RFC 6749 §3.1.2.3 allows this).
 *  - `state` is required when `requireState` — mitigates login CSRF.
 *
 * PKCE checks (RFC 7636 §4.3):
 *  - `code_challenge` required for public clients / requirePkce clients.
 *  - `code_challenge_method` must be S256 — 'plain' is accepted only for
 *    legacy clients explicitly opted out (flagged, not blocked).
 *  - Challenge length 43–128 chars, verifier-charset [A-Za-z0-9\-._~].
 *
 * Returns either a normalized request (defaults applied) or throws
 * OAuth2Error with the RFC-correct error code — matching how the
 * authorization endpoint must behave (invalid_request / invalid_scope /
 * unauthorized_client).
 *
 * @module OAuth2Layer/Engine2
 */

import { ClientRegistry } from '../core/ClientRegistry';
import { OAuth2Error, parseScope } from '../core/types';

export interface AuthorizeRequestInput {
  readonly client_id: string;
  readonly response_type: string;
  readonly redirect_uri?: string;
  readonly scope?: string;
  readonly state?: string;
  readonly code_challenge?: string;
  readonly code_challenge_method?: 'S256' | 'plain';
}

export interface NormalizedAuthorizeRequestInput {
  readonly client_id: string;
  readonly response_type: 'code';
  readonly redirect_uri: string;
  readonly scope: readonly string[];
  readonly state: string;
  readonly code_challenge?: string;
  readonly code_challenge_method?: 'S256' | 'plain';
  /** Security warnings surfaced without failing the request. */
  readonly warnings: readonly string[];
}

export interface AuthorizeValidatorOptions {
  /** Demand `state` on every request. Default true. */
  requireState?: boolean;
  /** Max length for state (NIST suggests >0; some IdPs cap at 1024). */
  maxStateLength?: number;
}

const CHALLENGE_CHARS = /^[A-Za-z0-9\-._~]+$/;

export class AuthorizeRequestValidator {
  private readonly _clients: ClientRegistry;
  private readonly _requireState: boolean;
  private readonly _maxStateLen: number;

  constructor(clients: ClientRegistry, opts: AuthorizeValidatorOptions = {}) {
    this._clients = clients;
    this._requireState = opts.requireState ?? true;
    this._maxStateLen = opts.maxStateLength ?? 1024;
  }

  /**
   * Validate + normalize an authorize request. Throws OAuth2Error on any
   * violation — the endpoint should render the error in-band.
   */
  validate(req: AuthorizeRequestInput): NormalizedAuthorizeRequestInput {
    const warnings: string[] = [];

    // -- client + response_type ----------------------------------------
    const client = this._clients.get(req.client_id); // throws invalid_client
    if (req.response_type !== 'code') {
      throw new OAuth2Error(
        'unsupported_response_type',
        `response_type must be 'code', got '${req.response_type}'`
      );
    }
    this._clients.assertGrantAllowed(req.client_id, 'authorization_code');

    // -- redirect_uri ---------------------------------------------------
    let redirectUri = req.redirect_uri;
    if (redirectUri === undefined) {
      if (client.redirectUris.length === 1) {
        redirectUri = client.redirectUris[0]; // RFC 6749 §3.1.2.3
      } else {
        throw new OAuth2Error(
          'invalid_request',
          'redirect_uri required (client has multiple registered)'
        );
      }
    }
    // EXACT match — never prefix (open redirector guard).
    this._clients.validateRedirectUri(req.client_id, redirectUri);

    // -- scope ----------------------------------------------------------
    const scopes = parseScope(req.scope);
    this._clients.assertScopesAllowed(req.client_id, scopes);

    // -- state ----------------------------------------------------------
    let state = req.state;
    if (state === undefined || state.length === 0) {
      if (this._requireState) {
        throw new OAuth2Error('invalid_request', 'state is required (CSRF protection)');
      }
      state = '';
      warnings.push('missing state — login CSRF exposure');
    } else if (state.length > this._maxStateLen) {
      throw new OAuth2Error('invalid_request', `state exceeds ${this._maxStateLen} chars`);
    }

    // -- PKCE -----------------------------------------------------------
    if (req.code_challenge !== undefined) {
      if (req.code_challenge.length < 43 || req.code_challenge.length > 128) {
        throw new OAuth2Error(
          'invalid_request',
          'code_challenge must be 43-128 characters (RFC 7636 §4.2)'
        );
      }
      if (!CHALLENGE_CHARS.test(req.code_challenge)) {
        throw new OAuth2Error('invalid_request', 'code_challenge uses disallowed characters');
      }
      const method = req.code_challenge_method ?? 'plain';
      if (method === 'plain') {
        warnings.push('PKCE method plain — S256 strongly recommended');
      }
    } else if (client.requirePkce || client.isPublic) {
      throw new OAuth2Error(
        'invalid_request',
        'code_challenge required (client mandates PKCE)'
      );
    }

    return {
      client_id: req.client_id,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: req.code_challenge,
      code_challenge_method: req.code_challenge_method,
      warnings,
    };
  }
}
