/**
 * Refresh Token grant — RFC 6749 §6.
 *
 * Rotates refresh tokens: each use consumes the old token and issues a
 * new one in the same family. Reuse of a rotated token revokes the
 * family (RFC 6819 §5.2.2.4 theft detection).
 */

import { ClientRegistry } from '../core/ClientRegistry';
import { TokenStore } from '../core/TokenStore';
import { OAuth2Error, parseScope, scopeSubset, scopeToString, TokenResponse } from '../core/types';

export interface RefreshTokenRequest {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
  client_secret?: string;
  /** Optionally narrow the scope of the new access token. */
  scope?: string;
}

export class RefreshTokenGrant {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly tokens: TokenStore
  ) {}

  execute(req: RefreshTokenRequest): TokenResponse {
    if (req.grant_type !== 'refresh_token') {
      throw new OAuth2Error('unsupported_grant_type', `Expected refresh_token, got ${req.grant_type}`);
    }
    this.clients.authenticate(req.client_id, req.client_secret);
    this.clients.assertGrantAllowed(req.client_id, 'refresh_token');

    const rt = this.tokens.consumeRefreshToken(req.refresh_token);
    if (rt.clientId !== req.client_id) {
      throw new OAuth2Error('invalid_grant', 'Refresh token was not issued to this client');
    }

    // Scope narrowing (RFC 6749 §6): requested scope must be ⊆ original.
    let scopes = rt.scope;
    if (req.scope !== undefined) {
      const requested = parseScope(req.scope);
      if (!scopeSubset(requested, rt.scope)) {
        throw new OAuth2Error(
          'invalid_scope',
          'Requested scope exceeds originally granted scope'
        );
      }
      scopes = requested;
    }

    const client = this.clients.get(req.client_id);
    const at = this.tokens.mintAccessToken({
      clientId: req.client_id,
      subject: rt.subject,
      scope: scopes,
      ttlSeconds: client.accessTokenTtlSeconds,
    });

    // Rotate: issue a new refresh token in the same family.
    let newRefresh: string | undefined;
    if (client.refreshTokenTtlSeconds !== undefined) {
      const next = this.tokens.mintRefreshToken({
        clientId: req.client_id,
        subject: rt.subject,
        scope: scopes,
        ttlSeconds: client.refreshTokenTtlSeconds,
        familyId: rt.familyId,
      });
      newRefresh = next.token;
    }

    const resp: TokenResponse = {
      access_token: at.token,
      token_type: 'Bearer',
      expires_in: client.accessTokenTtlSeconds,
      scope: scopes.length ? scopeToString(scopes) : undefined,
    };
    if (newRefresh) resp.refresh_token = newRefresh;
    return resp;
  }
}
