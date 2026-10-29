/**
 * Client Credentials grant — RFC 6749 §4.4.
 *
 * Machine-to-machine flow: client authenticates directly, receives an
 * access token with no user subject and no refresh token.
 */

import { ClientRegistry } from '../core/ClientRegistry';
import { TokenStore } from '../core/TokenStore';
import { OAuth2Error, parseScope, scopeToString, TokenResponse } from '../core/types';

export interface ClientCredentialsRequest {
  grant_type: 'client_credentials';
  client_id: string;
  client_secret: string;
  scope?: string;
}

export class ClientCredentialsGrant {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly tokens: TokenStore
  ) {}

  execute(req: ClientCredentialsRequest): TokenResponse {
    if (req.grant_type !== 'client_credentials') {
      throw new OAuth2Error(
        'unsupported_grant_type',
        `Expected client_credentials, got ${req.grant_type}`
      );
    }
    const client = this.clients.authenticate(req.client_id, req.client_secret);
    if (client.isPublic) {
      throw new OAuth2Error(
        'unauthorized_client',
        'Public clients cannot use client_credentials'
      );
    }
    this.clients.assertGrantAllowed(req.client_id, 'client_credentials');

    const scopes = parseScope(req.scope);
    this.clients.assertScopesAllowed(req.client_id, scopes);

    const at = this.tokens.mintAccessToken({
      clientId: req.client_id,
      scope: scopes,
      ttlSeconds: client.accessTokenTtlSeconds,
    });

    return {
      access_token: at.token,
      token_type: 'Bearer',
      expires_in: client.accessTokenTtlSeconds,
      scope: scopes.length ? scopeToString(scopes) : undefined,
    };
  }
}
