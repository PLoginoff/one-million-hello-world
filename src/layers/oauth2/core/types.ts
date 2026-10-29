/**
 * OAuth2 core types — RFC 6749, RFC 7636 (PKCE), RFC 8628 (device),
 * RFC 7662 (introspection), RFC 7009 (revocation), RFC 6750 (bearer).
 */

/* ------------------------------------------------------------------ *
 *  Error codes (RFC 6749 §5.2)                                        *
 * ------------------------------------------------------------------ */

export type OAuth2ErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  // device flow extensions (RFC 8628 §3.5)
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  // token endpoint / general
  | 'unsupported_response_type'
  | 'server_error'
  | 'temporarily_unavailable';

export class OAuth2Error extends Error {
  readonly code: OAuth2ErrorCode;
  readonly description?: string;
  readonly uri?: string;
  readonly status: number;

  constructor(
    code: OAuth2ErrorCode,
    description?: string,
    opts: { uri?: string; status?: number } = {}
  ) {
    super(description ?? code);
    this.name = 'OAuth2Error';
    this.code = code;
    this.description = description;
    this.uri = opts.uri;
    this.status = opts.status ?? this.defaultStatus(code);
  }

  private defaultStatus(code: OAuth2ErrorCode): number {
    switch (code) {
      case 'invalid_client':
        return 401;
      case 'invalid_grant':
      case 'invalid_request':
      case 'invalid_scope':
      case 'unauthorized_client':
      case 'unsupported_grant_type':
      case 'unsupported_response_type':
      case 'authorization_pending':
      case 'slow_down':
      case 'access_denied':
      case 'expired_token':
        return 400;
      case 'server_error':
        return 500;
      case 'temporarily_unavailable':
        return 503;
      default:
        return 400;
    }
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { error: this.code };
    if (this.description) out['error_description'] = this.description;
    if (this.uri) out['error_uri'] = this.uri;
    return out;
  }
}

/* ------------------------------------------------------------------ *
 *  Core domain types                                                  *
 * ------------------------------------------------------------------ */

export type GrantType =
  | 'authorization_code'
  | 'client_credentials'
  | 'refresh_token'
  | 'urn:ietf:params:oauth:grant-type:device_code'
  | 'password'; // legacy — included for completeness

export interface OAuth2Client {
  clientId: string;
  /** Stored as SHA-256 hash — never a raw secret. */
  clientSecretHash?: string;
  /** Public clients have no secret. */
  isPublic: boolean;
  redirectUris: string[];
  allowedGrantTypes: GrantType[];
  allowedScopes: string[];
  /** Require PKCE for authorization_code flow. */
  requirePkce: boolean;
  /** Default token TTL in seconds. */
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds?: number;
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  subject: string;
  expiresAtMs: number;
  /** PKCE */
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  /** Nonce for OIDC ID tokens. */
  nonce?: string;
  used: boolean;
}

export interface AccessToken {
  token: string;
  clientId: string;
  subject?: string;
  scope: string[];
  expiresAtMs: number;
  issuedAtMs: number;
  tokenType: 'Bearer';
  /** jti for revocation */
  jti: string;
}

export interface RefreshToken {
  token: string;
  clientId: string;
  subject: string;
  scope: string[];
  expiresAtMs: number;
  familyId: string;
  used: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export type DeviceStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'consumed';

export interface DeviceGrant {
  deviceCode: string;
  userCode: string;
  clientId: string;
  scope: string[];
  status: DeviceStatus;
  subject?: string;
  expiresAtMs: number;
  intervalSeconds: number;
  lastPolledAtMs?: number;
}

/* ------------------------------------------------------------------ *
 *  Introspection (RFC 7662)                                           *
 * ------------------------------------------------------------------ */

export interface IntrospectionRequest {
  token: string;
  token_type_hint?: 'access_token' | 'refresh_token';
}

export interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: 'Bearer';
  exp?: number;
  iat?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
}

/* ------------------------------------------------------------------ *
 *  Scope                                                              *
 * ------------------------------------------------------------------ */

export function parseScope(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function scopeToString(scopes: readonly string[]): string {
  return scopes.join(' ');
}

/** Check that every requested scope is allowed. */
export function scopeSubset(requested: readonly string[], allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return requested.every((s) => allow.has(s));
}
