/**
 * SSO federation types — SAML 2.0 + OIDC stubs, session tickets,
 * single sign-off, attribute mapping.
 */

/* ------------------------------------------------------------------ *
 *  Identity Provider registry                                         *
 * ------------------------------------------------------------------ */

export type IdpProtocol = 'saml2' | 'oidc' | 'oauth2';

export interface IdentityProvider {
  id: string;
  name: string;
  protocol: IdpProtocol;
  enabled: boolean;
  /** SAML entity ID / OIDC issuer URI */
  entityId: string;
  /** SSO endpoint (redirect URL for browser flows). */
  ssoUrl: string;
  /** SLO endpoint (single logout). */
  sloUrl?: string;
  /** Signature verification cert (PEM or JWK thumbprint). */
  certificate?: string;
  /** Claim/attribute mapping rules. */
  attributeMapping: AttributeMapping[];
  /** Additional protocol-specific config. */
  metadata?: Record<string, unknown>;
}

export interface AttributeMapping {
  /** Name in the IdP's assertion/claims. */
  source: string;
  /** Name to expose locally. */
  target: string;
  /** Optional transform applied to the value. */
  transform?: 'lowercase' | 'uppercase' | 'split:comma' | 'email-domain' | 'identity';
}

/* ------------------------------------------------------------------ *
 *  SAML                                                               *
 * ------------------------------------------------------------------ */

export interface SamlResponse {
  id: string;
  issuer: string;
  /** Subject NameID. */
  nameId: string;
  /** Assertion attributes as key → value[]. */
  attributes: Record<string, string[]>;
  /** Whether the assertion signature validates (stub returns parsed flag). */
  signatureValid: boolean;
  /** Conditions — NotBefore / NotOnOrAfter (unix ms). */
  notBeforeMs?: number;
  notOnOrAfterMs?: number;
  /** Audience restriction. */
  audience?: string;
  /** Session index for SLO. */
  sessionIndex?: string;
}

/* ------------------------------------------------------------------ *
 *  OIDC                                                               *
 * ------------------------------------------------------------------ */

export interface OidcTokens {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface OidcIdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

/* ------------------------------------------------------------------ *
 *  Session tickets                                                    *
 * ------------------------------------------------------------------ */

export interface SessionTicket {
  id: string;
  subject: string;
  /** IdP id that issued the original auth. */
  idpId: string;
  /** SAML SessionIndex or OIDC sid — needed for SLO. */
  idpSessionIndex?: string;
  /** Mapped attributes. */
  attributes: Record<string, unknown>;
  issuedAtMs: number;
  expiresAtMs: number;
  /** Nonce / one-time flag — tickets can be consumed once. */
  consumed: boolean;
}

/* ------------------------------------------------------------------ *
 *  Errors                                                             *
 * ------------------------------------------------------------------ */

export type SsoErrorCode =
  | 'invalid_request'
  | 'unknown_idp'
  | 'invalid_assertion'
  | 'assertion_expired'
  | 'assertion_not_yet_valid'
  | 'audience_mismatch'
  | 'signature_invalid'
  | 'session_expired'
  | 'session_unknown'
  | 'ticket_consumed'
  | 'slo_failed'
  | 'unsupported_protocol';

export class SsoFederationError extends Error {
  readonly code: SsoErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: SsoErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SsoFederationError';
    this.code = code;
    this.details = details;
  }
}
