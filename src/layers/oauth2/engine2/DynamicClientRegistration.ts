/**
 * DynamicClientRegistration — RFC 7591.
 *
 * Lets unknown clients register themselves and receive a `client_id`
 * (and `client_secret` for confidential types) plus a
 * `registration_access_token` that authorizes later read/update/delete
 * of that registration (RFC 7592's management protocol is modeled here
 * as read + delete).
 *
 * Validation rules implemented:
 *  - `token_endpoint_auth_method` drives public vs confidential:
 *    'none' → public client (no secret issued); secret methods →
 *    confidential.
 *  - `grant_types` are filtered to what the server supports; an
 *    incompatible request is rejected outright.
 *  - `redirect_uris` required for authorization_code clients — must be
 *    https or localhost; absolute URIs only (no fragments).
 *  - `scope` narrows the client's allowedScopes to the server's
 *    registerable scope set.
 *  - issued secrets are returned once (hashed storage via
 *    ClientRegistry); `client_secret_expires_at` = 0 = never.
 *
 * @module OAuth2Layer/Engine2
 */

import { randomBytes } from 'crypto';
import { ClientRegistry } from '../core/ClientRegistry';
import { GrantType, OAuth2Error, OAuth2ErrorCode, parseScope } from '../core/types';

/** RFC 7591 §3.2.2 adds error codes on top of RFC 6749's set — declared
 *  as an extension type so core types stay untouched. */
type DcrErrorCode = OAuth2ErrorCode | 'invalid_client_metadata' | 'invalid_redirect_uri' | 'invalid_software_statement' | 'unapproved_software_statement' | 'invalid_token';

class DcrError extends OAuth2Error {
  constructor(code: DcrErrorCode, description?: string, opts: { status?: number } = {}) {
    super(code as OAuth2ErrorCode, description, opts);
    this.name = 'DcrError';
  }
}
import {
  ClientRegistrationRequest,
  ClientRegistrationResponse,
  OAuthClock2,
  SystemOAuthClock2,
} from './types';

export interface DcrOptions {
  /** Grant types the server will register. */
  supportedGrants?: readonly string[];
  /** Scopes the server will hand out to self-registered clients. */
  registerableScopes?: readonly string[];
  /** Base URL for the registration management endpoint. */
  registrationBaseUri?: string;
  clock?: OAuthClock2;
}

const DEFAULT_GRANTS: readonly string[] = [
  'authorization_code',
  'refresh_token',
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:device_code',
];

interface RegistrationToken {
  clientId: string;
  expiresAtMs: number;
}

export class DynamicClientRegistration {
  private readonly _clients: ClientRegistry;
  private readonly _supportedGrants: Set<string>;
  private readonly _registerableScopes: Set<string>;
  private readonly _baseUri: string;
  private readonly _clock: OAuthClock2;
  /** registration_access_token → record */
  private readonly _regTokens = new Map<string, RegistrationToken>();
  private _seq = 0;

  constructor(clients: ClientRegistry, opts: DcrOptions = {}) {
    this._clients = clients;
    this._supportedGrants = new Set(opts.supportedGrants ?? DEFAULT_GRANTS);
    this._registerableScopes = new Set(opts.registerableScopes ?? []);
    this._baseUri = opts.registrationBaseUri ?? 'https://auth.local/register';
    this._clock = opts.clock ?? new SystemOAuthClock2();
  }

  /**
   * POST /register — validate metadata, create the client, return the
   * registration response (secret appears once, here only).
   */
  register(req: ClientRegistrationRequest): ClientRegistrationResponse {
    const authMethod = req.token_endpoint_auth_method ?? 'client_secret_basic';
    const isPublic = authMethod === 'none';

    // Grant type filtering: request ⊆ supported, else reject.
    const requestedGrants = req.grant_types ?? ['authorization_code'];
    for (const g of requestedGrants) {
      if (!this._supportedGrants.has(g)) {
        throw new DcrError('invalid_client_metadata', `unsupported grant_type: ${g}`);
      }
    }

    // Redirect URIs: required for code flow; must be absolute http(s) or localhost.
    const redirectUris = req.redirect_uris ?? [];
    if (requestedGrants.includes('authorization_code') && redirectUris.length === 0) {
      throw new DcrError('invalid_redirect_uri', 'redirect_uris required for authorization_code clients');
    }
    for (const uri of redirectUris) {
      this._assertValidRedirectUri(uri);
    }

    // Scope narrowing: requested ∩ registerable.
    const requestedScopes = parseScope(req.scope);
    if (this._registerableScopes.size > 0) {
      for (const s of requestedScopes) {
        if (!this._registerableScopes.has(s)) {
          throw new DcrError('invalid_client_metadata', `scope '${s}' not registerable`);
        }
      }
    }

    const clientId = `dcr-${++this._seq}-${randomBytes(8).toString('hex')}`;
    const grantTypes = requestedGrants as GrantType[];
    const now = Math.floor(this._clock.now() / 1000);
    const regToken = `rat-${randomBytes(32).toString('hex')}`;

    let secret: string | undefined;
    if (isPublic) {
      this._clients.registerPublic(clientId, {
        redirectUris: [...redirectUris],
        allowedGrantTypes: grantTypes,
        allowedScopes: requestedScopes,
        requirePkce: true,
      });
    } else {
      const r = this._clients.registerConfidential(clientId, {
        redirectUris: [...redirectUris],
        allowedGrantTypes: grantTypes,
        allowedScopes: requestedScopes,
        requirePkce: true,
      });
      secret = r.secret;
    }

    // The registration access token authorizes RFC 7592 management ops.
    this._regTokens.set(regToken, {
      clientId,
      expiresAtMs: this._clock.now() + 86_400_000, // 24h
    });

    return {
      client_id: clientId,
      client_secret: secret,
      client_id_issued_at: now,
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: requestedGrants,
      client_name: req.client_name,
      registration_access_token: regToken,
      registration_client_uri: `${this._baseUri}/${clientId}`,
    };
  }

  /**
   * RFC 7592 read: authenticate via the registration access token and
   * return the client's current metadata.
   */
  read(registrationAccessToken: string) {
    const rec = this._requireRegToken(registrationAccessToken);
    return this._clients.get(rec.clientId);
  }

  /** RFC 7592 delete: remove the client and burn the token. */
  delete(registrationAccessToken: string): boolean {
    const rec = this._requireRegToken(registrationAccessToken);
    this._regTokens.delete(registrationAccessToken);
    return this._clients.remove(rec.clientId);
  }

  /* ---------------------------------------------------------------- */

  private _requireRegToken(token: string): RegistrationToken {
    const rec = this._regTokens.get(token);
    if (!rec || this._clock.now() >= rec.expiresAtMs) {
      throw new DcrError('invalid_token', 'invalid or expired registration_access_token', {
        status: 401,
      });
    }
    return rec;
  }

  private _assertValidRedirectUri(uri: string): void {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new DcrError('invalid_redirect_uri', `not an absolute URI: ${uri}`);
    }
    if (parsed.hash) {
      throw new DcrError('invalid_redirect_uri', `fragment not allowed: ${uri}`);
    }
    const isLocalhost =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    if (parsed.protocol !== 'https:' && !isLocalhost) {
      throw new DcrError('invalid_redirect_uri', `https required (localhost excepted): ${uri}`);
    }
  }
}
