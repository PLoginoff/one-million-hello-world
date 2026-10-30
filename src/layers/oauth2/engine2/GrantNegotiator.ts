/**
 * GrantNegotiator — pick the right grant type for a client and context.
 *
 * Given a client (its allowed grant types), a desired flow shape, and
 * optional constraints, the negotiator produces a ranked list of viable
 * grant types — like content negotiation, but for OAuth flows.
 *
 * Ordering reflects OAuth 2.1 security guidance:
 *   authorization_code (w/ PKCE) > device_code > client_credentials
 *   > token_exchange > refresh_token > password (discouraged)
 *
 * Constraints prune the list: `requiresUser` drops client_credentials;
 * `offline` requires refresh_token support; `inputConstrained` prefers
 * device flow; `hasUserInteraction` false drops authorization_code.
 *
 * @module OAuth2Layer/Engine2
 */

import { GrantType, OAuth2Client } from '../core/types';
import { GRANT_TOKEN_EXCHANGE } from './types';

/** Extended grant set including RFC 8693. */
export type NegotiatedGrant = GrantType | typeof GRANT_TOKEN_EXCHANGE;

export interface FlowConstraints {
  /** A human subject is involved (not pure M2M). */
  requiresUser?: boolean;
  /** Needs long-lived offline access (refresh token). */
  offline?: boolean;
  /** Device can't accept keyboard input — prefer device flow. */
  inputConstrained?: boolean;
  /** Browser/user-agent interaction is available. */
  hasUserInteraction?: boolean;
  /** Client is public (SPA/mobile) — secrets unusable. */
  isPublicClient?: boolean;
}

export interface NegotiatedChoice {
  readonly grant: NegotiatedGrant;
  /** Rank (1 = best). */
  readonly rank: number;
  /** Why this grant fits the constraints. */
  readonly rationale: string;
}

/** Security-ranked ordering — lower score = preferred. */
const RANK: Record<string, number> = {
  authorization_code: 1,
  'urn:ietf:params:oauth:grant-type:device_code': 2,
  client_credentials: 3,
  [GRANT_TOKEN_EXCHANGE]: 4,
  refresh_token: 5,
  password: 9,
};

const ALL_GRANTS: readonly NegotiatedGrant[] = [
  'authorization_code',
  'urn:ietf:params:oauth:grant-type:device_code',
  'client_credentials',
  GRANT_TOKEN_EXCHANGE,
  'refresh_token',
  'password',
];

export class GrantNegotiator {
  /**
   * Rank viable grants for a client under the given constraints.
   * Returns empty array when nothing fits.
   */
  negotiate(client: OAuth2Client, c: FlowConstraints = {}): NegotiatedChoice[] {
    const allowed = new Set<NegotiatedGrant>(client.allowedGrantTypes);
    const out: NegotiatedChoice[] = [];

    for (const grant of ALL_GRANTS) {
      if (!allowed.has(grant as GrantType)) continue;
      const rationale = this._fits(grant, c, client);
      if (rationale === null) continue;
      out.push({ grant, rank: RANK[grant] ?? 50, rationale });
    }

    // Sort by base rank, then bump device flow up for input-constrained.
    out.sort((a, b) => a.rank - b.rank);
    if (c.inputConstrained) {
      const devIdx = out.findIndex(
        (o) => o.grant === 'urn:ietf:params:oauth:grant-type:device_code'
      );
      if (devIdx > 0) {
        const [dev] = out.splice(devIdx, 1);
        out.unshift({ ...dev, rationale: dev.rationale + ' (input-constrained device)' });
      }
    }
    return out;
  }

  /** The single best grant, or null. */
  best(client: OAuth2Client, c: FlowConstraints = {}): NegotiatedGrant | null {
    const choices = this.negotiate(client, c);
    return choices.length > 0 ? choices[0].grant : null;
  }

  /* ---------------------------------------------------------------- */

  /** Returns a rationale string when the grant fits, else null. */
  private _fits(
    grant: NegotiatedGrant,
    c: FlowConstraints,
    client: OAuth2Client
  ): string | null {
    switch (grant) {
      case 'authorization_code':
        if (c.hasUserInteraction === false) return null;
        if (c.requiresUser === false) return null;
        return client.requirePkce || c.isPublicClient
          ? 'interactive flow with PKCE'
          : 'interactive flow';
      case 'urn:ietf:params:oauth:grant-type:device_code':
        if (c.requiresUser === false) return null;
        if (c.hasUserInteraction === false) return null;
        return 'user authorizes on a second device';
      case 'client_credentials':
        if (c.requiresUser) return null;
        if (c.offline) return null;
        if (c.isPublicClient ?? client.isPublic) return null;
        return 'machine-to-machine, no user';
      case 'refresh_token':
        // Refresh isn't an entry grant — only viable when another flow
        // already ran. Surface it only when explicitly allowed AND the
        // caller wants offline-capable grants.
        if (!c.offline) return null;
        return 'extends an existing session offline';
      case GRANT_TOKEN_EXCHANGE:
        return 'delegation/impersonation between security domains';
      case 'password':
        if (c.requiresUser === false) return null;
        if (c.hasUserInteraction === false) return null;
        return 'legacy resource-owner flow (discouraged)';
      default:
        return null;
    }
  }
}
