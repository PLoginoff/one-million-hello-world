/**
 * OAuth2 Engine2 — Shared Types
 *
 * Second-generation OAuth2 primitives: RFC 8693 token exchange, device
 * authorization grant polling, RFC 7591 dynamic client registration,
 * RFC 9126 pushed authorization requests (PAR), and grant-type
 * negotiation.
 *
 * Reuses the v1 core types (OAuth2Error, TokenResponse, etc.) — engine2
 * adds the request/response shapes each RFC introduces.
 *
 * @module OAuth2Layer/Engine2
 */

import { TokenResponse } from '../core/types';

/** Injectable clock for PAR expiry, polling intervals, registration TTL. */
export interface OAuthClock2 {
  now(): number;
}

export class SystemOAuthClock2 implements OAuthClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualOAuthClock2 implements OAuthClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/*  RFC 8693 — Token Exchange                                          */
/* ------------------------------------------------------------------ */

export const GRANT_TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const TOKEN_TYPE_ACCESS = 'urn:ietf:params:oauth:token-type:access_token';
export const TOKEN_TYPE_REFRESH = 'urn:ietf:params:oauth:token-type:refresh_token';
export const TOKEN_TYPE_ID = 'urn:ietf:params:oauth:token-type:id_token';
export const TOKEN_TYPE_JWT = 'urn:ietf:params:oauth:token-type:jwt';
export const TOKEN_TYPE_SAML1 = 'urn:ietf:params:oauth:token-type:saml1';
export const TOKEN_TYPE_SAML2 = 'urn:ietf:params:oauth:token-type:saml2';

export interface Rfc8693ExchangeRequest {
  grant_type: typeof GRANT_TOKEN_EXCHANGE;
  /** The token being exchanged. */
  subject_token: string;
  subject_token_type: string;
  /** Optional second party performing the exchange (delegation). */
  actor_token?: string;
  actor_token_type?: string;
  /** Requested token type for the response. Default access_token. */
  requested_token_type?: string;
  resource?: string | readonly string[];
  audience?: string | readonly string[];
  scope?: string;
}

/** RFC 8693 §2.2 response adds issued_token_type + MAY forward actor. */
export interface Rfc8693ExchangeResponse extends TokenResponse {
  issued_token_type: string;
}

/* ------------------------------------------------------------------ */
/*  RFC 9126 — Pushed Authorization Requests (PAR)                     */
/* ------------------------------------------------------------------ */

export interface ParRequest {
  client_id: string;
  response_type: 'code';
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
  nonce?: string;
}

export interface ParResponse {
  /** urn:ietf:params:oauth:request_uri:<opaque> */
  request_uri: string;
  /** Seconds until the PAR expires. */
  expires_in: number;
}

/* ------------------------------------------------------------------ */
/*  RFC 7591 — Dynamic Client Registration                             */
/* ------------------------------------------------------------------ */

export interface ClientRegistrationRequest {
  redirect_uris?: readonly string[];
  token_endpoint_auth_method?: 'client_secret_basic' | 'client_secret_post' | 'none';
  grant_types?: readonly string[];
  response_types?: readonly string[];
  client_name?: string;
  client_uri?: string;
  scope?: string;
  contacts?: readonly string[];
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  redirect_uris: readonly string[];
  token_endpoint_auth_method: string;
  grant_types: readonly string[];
  client_name?: string;
  registration_access_token: string;
  registration_client_uri: string;
}
