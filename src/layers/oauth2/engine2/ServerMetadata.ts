/**
 * ServerMetadata — RFC 8414 authorization server metadata and
 * protected-resource capability checks (RFC 8707 resource indicators).
 *
 * Two halves:
 *
 *  1. `metadataDocument()` builds the `.well-known/oauth-authorization-server`
 *     document from the server's actual configuration — grant types,
 *     scopes, endpoint URIs — so clients can discover capabilities.
 *
 *  2. `resolveResource()` validates `resource` request parameters
 *     (RFC 8707): the parameter must be an absolute URI without a
 *     fragment, and (when `knownResources` is configured) must match a
 *     registered resource indicator exactly — open-ended resources would
 *     let tokens be minted for arbitrary audiences.
 *
 * @module OAuth2Layer/Engine2
 */

import { OAuth2Error } from '../core/types';
import { GRANT_TOKEN_EXCHANGE } from './types';

/** RFC 8414 §2 metadata fields (subset the server actually publishes). */
export interface ServerMetadataDocument {
  readonly issuer: string;
  readonly authorization_endpoint?: string;
  readonly token_endpoint?: string;
  readonly registration_endpoint?: string;
  readonly introspection_endpoint?: string;
  readonly revocation_endpoint?: string;
  readonly device_authorization_endpoint?: string;
  readonly pushed_authorization_request_endpoint?: string;
  readonly jwks_uri?: string;
  readonly grant_types_supported: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly token_endpoint_auth_methods_supported: readonly string[];
  readonly scopes_supported: readonly string[];
  readonly code_challenge_methods_supported: readonly string[];
  readonly pushed_authorization_request_endpoint_supported?: boolean;
  readonly [field: string]: unknown;
}

export interface ServerMetadataOptions {
  readonly issuer: string;
  readonly grants: readonly string[];
  readonly scopes: readonly string[];
  /** Endpoint paths are joined onto the issuer. */
  readonly endpoints?: Partial<Record<string, string>>;
}

export class ServerMetadata {
  private readonly _issuer: string;
  private readonly _grants: readonly string[];
  private readonly _scopes: readonly string[];
  private readonly _endpoints: Record<string, string>;
  private readonly _knownResources = new Set<string>();

  constructor(opts: ServerMetadataOptions) {
    this._issuer = opts.issuer.replace(/\/$/, '');
    this._grants = [...opts.grants, GRANT_TOKEN_EXCHANGE];
    this._scopes = opts.scopes;
    this._endpoints = {
      authorization_endpoint: '/authorize',
      token_endpoint: '/token',
      pushed_authorization_request_endpoint: '/par',
      registration_endpoint: '/register',
      device_authorization_endpoint: '/device',
      jwks_uri: '/.well-known/jwks.json',
      ...opts.endpoints,
    };
  }

  /** Publish a resource indicator this server will accept (RFC 8707). */
  registerResource(uri: string): void {
    this._assertAbsoluteUri(uri);
    this._knownResources.add(uri);
  }

  unregisterResource(uri: string): boolean {
    return this._knownResources.delete(uri);
  }

  /**
   * Validate the `resource` parameter from a token/PAR request.
   * - undefined / empty → ok
   * - non-absolute or fragment-bearing URI → invalid_request
   * - not in knownResources (when any registered) → invalid_target
   */
  resolveResource(param: string | readonly string[] | undefined | null): string[] {
    if (param === undefined || param === null) return [];
    const list = (Array.isArray(param) ? [...param] : [param]).filter((s) => s.length > 0);
    for (const uri of list) {
      this._assertAbsoluteUri(uri);
      if (this._knownResources.size > 0 && !this._knownResources.has(uri)) {
        throw new OAuth2Error(
          'invalid_request',
          `unknown resource indicator: ${uri}`
        );
      }
    }
    return list;
  }

  /** First resource URI, or undefined — convenience for single-audience callers. */
  primaryResource(param: string | readonly string[] | undefined | null): string | undefined {
    return this.resolveResource(param)[0];
  }

  /** The RFC 8414 metadata document. */
  metadataDocument(): ServerMetadataDocument {
    const ep = (k: string): string | undefined =>
      this._endpoints[k] !== undefined ? this._issuer + this._endpoints[k] : undefined;
    return {
      issuer: this._issuer,
      authorization_endpoint: ep('authorization_endpoint'),
      token_endpoint: ep('token_endpoint'),
      registration_endpoint: ep('registration_endpoint'),
      introspection_endpoint: ep('introspection_endpoint'),
      revocation_endpoint: ep('revocation_endpoint'),
      device_authorization_endpoint: ep('device_authorization_endpoint'),
      pushed_authorization_request_endpoint: ep('pushed_authorization_request_endpoint'),
      jwks_uri: ep('jwks_uri'),
      grant_types_supported: this._grants,
      response_types_supported: ['code'],
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
        'none',
      ],
      scopes_supported: this._scopes,
      code_challenge_methods_supported: ['S256', 'plain'],
      pushed_authorization_request_endpoint_supported: true,
    };
  }

  get issuer(): string {
    return this._issuer;
  }

  /* ---------------------------------------------------------------- */

  private _assertAbsoluteUri(uri: string): void {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new OAuth2Error('invalid_request', `resource must be an absolute URI: ${uri}`);
    }
    if (parsed.hash) {
      throw new OAuth2Error('invalid_request', `resource URI must not contain a fragment: ${uri}`);
    }
  }
}
