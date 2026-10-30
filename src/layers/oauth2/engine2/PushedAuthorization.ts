/**
 * PushedAuthorization — RFC 9126 (PAR).
 *
 * Instead of carrying authorization params in the front-channel URL
 * (loggable, tamperable, length-limited), the client POSTs them to the
 * PAR endpoint and receives an opaque `request_uri` —
 * `urn:ietf:params:oauth:request_uri:<random>` — which then appears as
 * the only authorization parameter:
 *
 *   GET /authorize?client_id=X&request_uri=urn:ietf:...:Y
 *
 * Semantics implemented:
 *  - `push()` validates client + redirect_uri exactly like the normal
 *    authorize endpoint would, then stores the full request under a
 *    generated request_uri with TTL (`expires_in` seconds, default 60).
 *  - `consume()` is exactly-once — the request_uri burns on use even
 *    when valid (RFC 9126 §4: single use).
 *  - Expired PARs are dropped lazily on consume and eagerly on sweep.
 *  - PKCE params are preserved verbatim through the push so the
 *    downstream authorization code flow still enforces them.
 *
 * @module OAuth2Layer/Engine2
 */

import { randomBytes } from 'crypto';
import { ClientRegistry } from '../core/ClientRegistry';
import { OAuth2Error, parseScope } from '../core/types';
import { OAuthClock2, ParRequest, ParResponse, SystemOAuthClock2 } from './types';

const REQUEST_URI_PREFIX = 'urn:ietf:params:oauth:request_uri:';

interface StoredPar {
  request: ParRequest;
  expiresAtMs: number;
}

export interface ParOptions {
  /** PAR lifetime in seconds. Default 60. */
  ttlSeconds?: number;
  /** Authorization endpoint base for building client-facing URIs. */
  issuerBase?: string;
  clock?: OAuthClock2;
}

export class PushedAuthorization {
  private readonly _clients: ClientRegistry;
  private readonly _ttlSec: number;
  private readonly _clock: OAuthClock2;
  private readonly _store = new Map<string, StoredPar>();

  constructor(clients: ClientRegistry, opts: ParOptions = {}) {
    this._clients = clients;
    this._ttlSec = Math.max(1, opts.ttlSeconds ?? 60);
    this._clock = opts.clock ?? new SystemOAuthClock2();
  }

  /**
   * PAR endpoint: validate the request, stash it, mint the request_uri.
   */
  push(req: ParRequest): ParResponse {
    // Same validation the authorize endpoint would apply — reject early
    // so a garbage request_uri never circulates.
    const client = this._clients.get(req.client_id); // throws unknown client
    if (client.isPublic === false) {
      // RFC 9126 §2.1: confidential clients MUST authenticate at the PAR
      // endpoint. Authentication is the caller's job (HTTP layer) — we
      // just flag that they must have done it.
      // (no-op: documented contract)
    }
    this._clients.validateRedirectUri(req.client_id, req.redirect_uri);
    const scopes = parseScope(req.scope);
    this._clients.assertScopesAllowed(req.client_id, scopes);
    if (req.response_type !== 'code') {
      throw new OAuth2Error('unsupported_response_type', 'PAR supports response_type=code only');
    }

    const requestUri = REQUEST_URI_PREFIX + randomBytes(24).toString('hex');
    this._store.set(requestUri, {
      request: req,
      expiresAtMs: this._clock.now() + this._ttlSec * 1000,
    });
    return { request_uri: requestUri, expires_in: this._ttlSec };
  }

  /**
   * Authorization endpoint: resolve + burn a request_uri. Returns the
   * original pushed parameters, exactly once.
   */
  consume(requestUri: string, clientId: string): ParRequest {
    if (!requestUri.startsWith(REQUEST_URI_PREFIX)) {
      throw new OAuth2Error('invalid_request', 'Malformed request_uri');
    }
    const entry = this._store.get(requestUri);
    if (!entry) {
      throw new OAuth2Error('invalid_request', 'Unknown request_uri');
    }
    // Single-use: burn before validating so a raced second consume fails.
    this._store.delete(requestUri);
    if (this._clock.now() >= entry.expiresAtMs) {
      throw new OAuth2Error('invalid_request', 'request_uri expired');
    }
    if (entry.request.client_id !== clientId) {
      throw new OAuth2Error('invalid_client', 'request_uri not issued to this client', {
        status: 401,
      });
    }
    return entry.request;
  }

  /** Peek without consuming (for diagnostics). */
  inspect(requestUri: string): ParRequest | null {
    const e = this._store.get(requestUri);
    return e && this._clock.now() < e.expiresAtMs ? e.request : null;
  }

  /** Drop expired entries; returns how many. */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, v] of this._store) {
      if (now >= v.expiresAtMs) {
        this._store.delete(k);
        n++;
      }
    }
    return n;
  }

  get pendingCount(): number {
    return this._store.size;
  }
}
