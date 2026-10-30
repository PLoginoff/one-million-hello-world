/**
 * TokenExchangeGrant — RFC 8693.
 *
 * Exchanges a subject token for a new one, supporting two patterns:
 *
 *  - Impersonation: subject_token identifies the user; the client gets a
 *    token with that user's identity but the *client's* scope subset.
 *  - Delegation: actor_token is present — the actor (e.g. a service)
 *    acts on behalf of the subject; the minted token records the
 *    delegation chain in `act` semantics (we carry it via metadata on
 *    the issued scope, since AccessToken has no `act` claim — see
 *    delegatedActor below).
 *
 * Scope reduction: the issued scope is always a subset — either the
 * explicitly requested `scope` ∩ subject's scope ∩ client's allowed
 * scopes, or (no request) subject's scope ∩ client's allowed scopes.
 * Escalation is impossible by construction.
 *
 * @module OAuth2Layer/Engine2
 */

import { ClientRegistry } from '../core/ClientRegistry';
import { TokenStore } from '../core/TokenStore';
import { OAuth2Error, parseScope, scopeSubset, scopeToString } from '../core/types';
import {
  GRANT_TOKEN_EXCHANGE,
  TOKEN_TYPE_ACCESS,
  Rfc8693ExchangeRequest,
  Rfc8693ExchangeResponse,
} from './types';

export interface ExchangeOutcome {
  readonly response: Rfc8693ExchangeResponse;
  /** Subject of the minted token (impersonated or same-subject). */
  readonly subject: string | undefined;
  /** Actor client id when delegation was used. */
  readonly delegatedActor: string | undefined;
}

export class TokenExchangeGrant {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly tokens: TokenStore
  ) {}

  /**
   * Execute a token exchange.
   *
   * `authenticate` gives the *requesting* client; `subject_token` is
   * resolved through the TokenStore (must be a live access token issued
   * by this server — we don't introspect foreign tokens).
   */
  execute(req: Rfc8693ExchangeRequest, clientId: string, clientSecret?: string): ExchangeOutcome {
    if (req.grant_type !== GRANT_TOKEN_EXCHANGE) {
      throw new OAuth2Error('unsupported_grant_type', `Expected ${GRANT_TOKEN_EXCHANGE}`);
    }
    if (req.subject_token_type !== TOKEN_TYPE_ACCESS) {
      // Only access tokens are exchangeable here — JWT/SAML support would
      // need a foreign-token introspection hook.
      throw new OAuth2Error(
        'invalid_request',
        `subject_token_type must be ${TOKEN_TYPE_ACCESS}`
      );
    }

    const client = this.clients.authenticate(clientId, clientSecret);

    // Resolve the subject token — throws invalid_grant when bad.
    const subject = this.tokens.requireAccessToken(req.subject_token);

    // Delegation: the actor token must be a live access token belonging
    // to this same client (a client can only delegate itself).
    let delegatedActor: string | undefined;
    if (req.actor_token !== undefined) {
      const actor = this.tokens.requireAccessToken(req.actor_token);
      if (actor.clientId !== clientId) {
        throw new OAuth2Error('invalid_grant', 'actor_token belongs to a different client');
      }
      delegatedActor = actor.clientId;
    }

    // Compute the issued scope:
    //  - explicit request: must satisfy BOTH subject scope and client
    //    allowed scopes — anything beyond is invalid_scope.
    //  - no request: silently intersect subject ∩ client (RFC 8693 §2.1
    //    "scope MUST NOT exceed the original" and the client can't hold
    //    what it was never granted).
    let issued: readonly string[];
    if (req.scope !== undefined) {
      const requested = parseScope(req.scope);
      if (!scopeSubset(requested, subject.scope)) {
        throw new OAuth2Error('invalid_scope', 'Requested scope exceeds subject token scope');
      }
      if (client.allowedScopes.length > 0 && !scopeSubset(requested, client.allowedScopes)) {
        throw new OAuth2Error('invalid_scope', 'Requested scope exceeds client permissions');
      }
      issued = requested;
    } else {
      issued =
        client.allowedScopes.length > 0
          ? subject.scope.filter((s) => client.allowedScopes.includes(s))
          : subject.scope;
    }

    const at = this.tokens.mintAccessToken({
      clientId,
      subject: subject.subject,
      scope: [...issued],
      ttlSeconds: client.accessTokenTtlSeconds,
    });

    return {
      response: {
        access_token: at.token,
        token_type: 'Bearer',
        expires_in: client.accessTokenTtlSeconds,
        issued_token_type: TOKEN_TYPE_ACCESS,
        scope: scopeToString(issued),
      },
      subject: subject.subject,
      delegatedActor,
    };
  }
}
