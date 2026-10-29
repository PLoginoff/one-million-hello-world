/**
 * ClientRegistry — OAuth2 client store and authentication.
 *
 * Secrets are stored hashed (SHA-256 + per-client salt) — never plaintext.
 * Authentication uses constant-time comparison.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { GrantType, OAuth2Client, OAuth2Error, scopeSubset } from './types';

interface StoredClient extends OAuth2Client {
  secretSalt?: string;
}

export class ClientRegistry {
  private clients = new Map<string, StoredClient>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** Register a confidential client (with secret). Returns the raw secret ONCE. */
  registerConfidential(
    clientId: string,
    opts: {
      redirectUris?: string[];
      allowedGrantTypes?: GrantType[];
      allowedScopes?: string[];
      requirePkce?: boolean;
      accessTokenTtlSeconds?: number;
      refreshTokenTtlSeconds?: number;
      secret?: string;
    } = {}
  ): { client: OAuth2Client; secret: string } {
    const secret = opts.secret ?? `sec-${randomBytes(32).toString('hex')}`;
    const salt = randomBytes(16).toString('hex');
    const client: StoredClient = {
      clientId,
      isPublic: false,
      redirectUris: opts.redirectUris ?? [],
      allowedGrantTypes: opts.allowedGrantTypes ?? [
        'authorization_code',
        'refresh_token',
        'client_credentials',
      ],
      allowedScopes: opts.allowedScopes ?? [],
      requirePkce: opts.requirePkce ?? true,
      accessTokenTtlSeconds: opts.accessTokenTtlSeconds ?? 900,
      refreshTokenTtlSeconds: opts.refreshTokenTtlSeconds,
      clientSecretHash: this.hashSecret(secret, salt),
      secretSalt: salt,
    };
    this.clients.set(clientId, client);
    return { client: this.publicView(client), secret };
  }

  /** Register a public client (SPA / mobile / device). */
  registerPublic(
    clientId: string,
    opts: {
      redirectUris?: string[];
      allowedGrantTypes?: GrantType[];
      allowedScopes?: string[];
      requirePkce?: boolean;
      accessTokenTtlSeconds?: number;
      refreshTokenTtlSeconds?: number;
    } = {}
  ): OAuth2Client {
    const client: StoredClient = {
      clientId,
      isPublic: true,
      redirectUris: opts.redirectUris ?? [],
      allowedGrantTypes: opts.allowedGrantTypes ?? [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      allowedScopes: opts.allowedScopes ?? [],
      requirePkce: opts.requirePkce ?? true,
      accessTokenTtlSeconds: opts.accessTokenTtlSeconds ?? 900,
      refreshTokenTtlSeconds: opts.refreshTokenTtlSeconds,
    };
    this.clients.set(clientId, client);
    return this.publicView(client);
  }

  /** Look up a client by id. Throws `invalid_client` if unknown. */
  get(clientId: string): OAuth2Client {
    const c = this.clients.get(clientId);
    if (!c) {
      throw new OAuth2Error('invalid_client', `Unknown client_id: ${clientId}`, { status: 401 });
    }
    return this.publicView(c);
  }

  /** Whether a client exists. */
  has(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  /** Remove a client. */
  remove(clientId: string): boolean {
    return this.clients.delete(clientId);
  }

  /**
   * Authenticate a client.
   * - confidential clients must present a correct secret.
   * - public clients are authenticated by identity alone.
   */
  authenticate(clientId: string, clientSecret?: string): OAuth2Client {
    const c = this.clients.get(clientId);
    if (!c) {
      throw new OAuth2Error('invalid_client', `Unknown client_id: ${clientId}`, { status: 401 });
    }
    if (c.isPublic) {
      return this.publicView(c);
    }
    if (!clientSecret) {
      throw new OAuth2Error('invalid_client', 'client_secret required for confidential client', {
        status: 401,
      });
    }
    const expected = c.clientSecretHash ?? '';
    const actual = this.hashSecret(clientSecret, c.secretSalt ?? '');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(actual, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new OAuth2Error('invalid_client', 'Invalid client credentials', { status: 401 });
    }
    return this.publicView(c);
  }

  /**
   * Validate that a redirect_uri is registered for the client.
   * Per RFC 6749 §3.1.2 the redirect_uri must match EXACTLY one of the
   * registered URIs (no prefix matching, no open redirectors).
   */
  validateRedirectUri(clientId: string, redirectUri: string): void {
    const c = this.get(clientId);
    if (!c.redirectUris.includes(redirectUri)) {
      throw new OAuth2Error(
        'invalid_request',
        `redirect_uri not registered: ${redirectUri}`
      );
    }
  }

  /** Check the client is allowed to use a grant type. */
  assertGrantAllowed(clientId: string, grantType: GrantType): void {
    const c = this.get(clientId);
    if (!c.allowedGrantTypes.includes(grantType)) {
      throw new OAuth2Error(
        'unauthorized_client',
        `Client ${clientId} not authorised for grant ${grantType}`
      );
    }
  }

  /** Check requested scopes are a subset of the client's allowed scopes. */
  assertScopesAllowed(clientId: string, scopes: string[]): void {
    const c = this.get(clientId);
    if (c.allowedScopes.length === 0) return; // no restriction configured
    if (!scopeSubset(scopes, c.allowedScopes)) {
      throw new OAuth2Error('invalid_scope', 'Requested scope exceeds client permissions', {
        status: 400,
      });
    }
  }

  /** Number of registered clients. */
  get size(): number {
    return this.clients.size;
  }

  /* ---------------------------------------------------------------- */

  private hashSecret(secret: string, salt: string): string {
    return createHash('sha256').update(`${salt}:${secret}`).digest('hex');
  }

  private publicView(c: StoredClient): OAuth2Client {
    const { secretSalt: _salt, ...rest } = c;
    void _salt;
    return { ...rest };
  }
}
