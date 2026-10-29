/**
 * OAuth2AuthorizationServer — facade that wires the client registry,
 * token store and all four grant implementations together and exposes a
 * uniform token endpoint + introspection + revocation surface.
 */

import { ClientRegistry } from './core/ClientRegistry';
import { TokenStore } from './core/TokenStore';
import {
  IntrospectionRequest,
  IntrospectionResponse,
  OAuth2Error,
} from './core/types';
import { AuthorizationCodeGrant, TokenExchangeRequest } from './grants/AuthorizationCodeGrant';
import { ClientCredentialsGrant, ClientCredentialsRequest } from './grants/ClientCredentialsGrant';
import { DeviceCodeGrant, DeviceAuthorizationRequest, DeviceTokenRequest } from './grants/DeviceCodeGrant';
import { RefreshTokenGrant, RefreshTokenRequest } from './grants/RefreshTokenGrant';

export type TokenRequest =
  | TokenExchangeRequest
  | ClientCredentialsRequest
  | RefreshTokenRequest
  | DeviceTokenRequest;

export class OAuth2AuthorizationServer {
  readonly clients: ClientRegistry;
  readonly tokens: TokenStore;
  readonly authCode: AuthorizationCodeGrant;
  readonly clientCreds: ClientCredentialsGrant;
  readonly refreshToken: RefreshTokenGrant;
  readonly deviceCode: DeviceCodeGrant;
  private readonly issuer: string;

  constructor(opts: { issuer?: string; now?: () => number } = {}) {
    this.issuer = opts.issuer ?? 'https://auth.local';
    this.clients = new ClientRegistry({ now: opts.now });
    this.tokens = new TokenStore({ now: opts.now, issuer: this.issuer });
    this.authCode = new AuthorizationCodeGrant(this.clients, this.tokens, { now: opts.now });
    this.clientCreds = new ClientCredentialsGrant(this.clients, this.tokens);
    this.refreshToken = new RefreshTokenGrant(this.clients, this.tokens);
    this.deviceCode = new DeviceCodeGrant(this.clients, this.tokens, { now: opts.now });
  }

  /**
   * Dispatch on grant_type to the correct grant implementation.
   */
  tokenEndpoint(req: TokenRequest) {
    switch (req.grant_type) {
      case 'authorization_code':
        return this.authCode.exchange(req);
      case 'client_credentials':
        return this.clientCreds.execute(req);
      case 'refresh_token':
        return this.refreshToken.execute(req);
      case 'urn:ietf:params:oauth:grant-type:device_code':
        return this.deviceCode.token(req);
      default:
        throw new OAuth2Error(
          'unsupported_grant_type',
          `Unsupported grant_type: ${String((req as { grant_type?: string }).grant_type)}`
        );
    }
  }

  /**
   * Device authorization endpoint shortcut.
   */
  deviceAuthorizationEndpoint(req: DeviceAuthorizationRequest) {
    return this.deviceCode.deviceAuthorization(req);
  }

  /**
   * Introspection endpoint — RFC 7662.
   */
  introspect(req: IntrospectionRequest): IntrospectionResponse {
    return this.tokens.introspect(req.token);
  }

  /**
   * Revocation endpoint — RFC 7009. Returns 200 even for unknown tokens
   * (per spec, revocation responses must not reveal whether the token
   * existed).
   */
  revoke(token: string): { ok: boolean } {
    this.tokens.revoke(token);
    return { ok: true };
  }
}
