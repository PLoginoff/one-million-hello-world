/**
 * RelyingPartyRegistry — OIDC-style client (SP) registration.
 *
 * Where TrustRelationship models SAML-ish bilateral trust, an
 * RP registration models OIDC-ish unilateral onboarding: a client_id,
 * registered redirect_uris (exact-match only — no substring tricks),
 * allowed grant types, scopes, token TTL, and an optional PKCE
 * requirement.
 *
 * Validates authorization requests at the door:
 *  - client_id must be registered and active
 *  - redirect_uri must EXACTLY equal a registered URI (string equality,
 *    no normalization — per RFC 6749 §3.1.2.2 the IdP must not guess)
 *  - requested scope must be a subset of the allowed set
 *  - PKCE required/enforced when configured
 *
 * @module IdentityProvider/Federation
 */

import { createHash, randomBytes } from 'crypto';
import { FederationError, FederationErrorCode, OidcAuthorizationRequest } from './types';

export interface RelyingParty {
  clientId: string;
  /** Hashed secret (sha256) — the raw secret is shown once at registration. */
  secretHash?: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: Array<'authorization_code' | 'refresh_token'>;
  requirePkce: boolean;
  /** Friendly name for consent screens. */
  displayName?: string;
  active: boolean;
  registeredAt: number;
}

export class RelyingPartyRegistry {
  private readonly _clients: Map<string, RelyingParty> = new Map();

  /** Register a new client. Returns the record + plaintext secret (shown once). */
  register(input: {
    redirectUris: string[];
    allowedScopes: string[];
    grantTypes?: RelyingParty['grantTypes'];
    requirePkce?: boolean;
    displayName?: string;
    withSecret?: boolean;
    now?: number;
  }): { client: RelyingParty; secret?: string } {
    if (input.redirectUris.length === 0) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'at least one redirect_uri required');
    }
    const clientId = `cli_${randomBytes(9).toString('base64url')}`;
    const secret = input.withSecret ? randomBytes(32).toString('base64url') : undefined;
    const client: RelyingParty = {
      clientId,
      secretHash: secret !== undefined ? createHash('sha256').update(secret).digest('hex') : undefined,
      redirectUris: [...input.redirectUris],
      allowedScopes: [...input.allowedScopes],
      grantTypes: input.grantTypes ?? ['authorization_code'],
      requirePkce: input.requirePkce ?? false,
      displayName: input.displayName,
      active: true,
      registeredAt: input.now ?? Date.now(),
    };
    this._clients.set(clientId, client);
    return { client, secret };
  }

  /** Verify a client secret (constant-time-ish via hash comparison). */
  verifySecret(clientId: string, secret: string): boolean {
    const c = this._clients.get(clientId);
    if (!c?.secretHash) return false;
    return c.secretHash === createHash('sha256').update(secret).digest('hex');
  }

  /** Deactivate/reactivate a client. */
  setActive(clientId: string, active: boolean): void {
    const c = this._require(clientId);
    c.active = active;
  }

  get(clientId: string): RelyingParty | undefined {
    return this._clients.get(clientId);
  }

  private _require(clientId: string): RelyingParty {
    const c = this._clients.get(clientId);
    if (!c) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `unknown client ${clientId}`);
    }
    return c;
  }

  /**
   * Validate an authorization request against the client's registration.
   * Throws BAD_REQUEST / UNKNOWN_ENTITY / STATE_MISMATCH as appropriate.
   */
  validateAuthorizationRequest(req: OidcAuthorizationRequest): RelyingParty {
    const client = this._require(req.clientId);
    if (!client.active) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, `client ${req.clientId} disabled`);
    }
    if (!client.grantTypes.includes('authorization_code')) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'client not permitted authorization_code');
    }
    if (!client.redirectUris.includes(req.redirectUri)) {
      throw new FederationError(
        FederationErrorCode.STATE_MISMATCH,
        `redirect_uri not registered: ${req.redirectUri}`
      );
    }
    for (const s of req.scope) {
      if (!client.allowedScopes.includes(s)) {
        throw new FederationError(FederationErrorCode.BAD_REQUEST, `scope not allowed: ${s}`);
      }
    }
    if (client.requirePkce && req.codeChallenge === undefined) {
      throw new FederationError(FederationErrorCode.BAD_REQUEST, 'client requires PKCE');
    }
    return client;
  }

  size(): number {
    return this._clients.size;
  }
}
