/**
 * SsoEngine — orchestrates IdP-driven authentication into local session
 * tickets. Ties together the registry, SAML parser, OIDC flow, attribute
 * mapper and ticket store.
 */

import { AttributeMapper } from './AttributeMapper';
import { IdpRegistry } from './IdpRegistry';
import { OidcFlow, OidcFlowOptions } from './OidcFlow';
import { SamlResponseParser } from './SamlResponseParser';
import { SessionTicketStore } from './SessionTicketStore';
import { SloCoordinator, SloTransport } from './SloCoordinator';
import { SamlResponse, SessionTicket, SsoFederationError } from './types';

export class SsoEngine {
  readonly registry = new IdpRegistry();
  readonly tickets: SessionTicketStore;
  readonly slo: SloCoordinator;
  private readonly now: () => number;

  constructor(opts: { now?: () => number; ticketTtlMs?: number; sloTransport?: SloTransport } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.tickets = new SessionTicketStore({ now: this.now, ttlMs: opts.ticketTtlMs });
    this.slo = new SloCoordinator(this.tickets, this.registry, opts.sloTransport);
  }

  /**
   * Consume a SAML response and produce a session ticket.
   */
  consumeSaml(encoded: string, expectedAudience?: string): { token: string; ticket: SessionTicket } {
    const resp: SamlResponse = SamlResponseParser.parse(encoded, {
      now: this.now,
      expectedAudience,
    });
    const idp = this.registry.getByEntityId(resp.issuer);
    if (!idp) {
      throw new SsoFederationError('unknown_idp', `No IdP registered for issuer ${resp.issuer}`);
    }
    if (!idp.enabled) {
      throw new SsoFederationError('unknown_idp', `IdP disabled: ${idp.id}`);
    }
    if (!resp.signatureValid && idp.certificate) {
      // If a cert is configured, a missing/invalid signature is a hard failure.
      throw new SsoFederationError('signature_invalid', 'Assertion signature missing/invalid');
    }
    const mapped = AttributeMapper.apply(resp.attributes, idp.attributeMapping);
    return this.tickets.issue({
      subject: resp.nameId,
      idpId: idp.id,
      idpSessionIndex: resp.sessionIndex,
      attributes: mapped,
    });
  }

  /**
   * Start an OIDC authorization flow for a registered IdP.
   */
  startOidc(idpId: string, opts: OidcFlowOptions, extras?: { usePkce?: boolean }) {
    const idp = this.registry.get(idpId);
    const flow = new OidcFlow(idp, opts, { now: this.now });
    return flow.startAuthorization(extras);
  }

  /**
   * Complete an OIDC callback → session ticket.
   */
  async finishOidc(
    idpId: string,
    opts: OidcFlowOptions,
    input: Parameters<OidcFlow['handleCallback']>[0]
  ) {
    const idp = this.registry.get(idpId);
    const flow = new OidcFlow(idp, opts, { now: this.now });
    const { tokens, claims } = await flow.handleCallback(input);
    const mapped = AttributeMapper.apply(
      Object.fromEntries(
        Object.entries(claims).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.map(String) : String(v),
        ])
      ),
      idp.attributeMapping
    );
    const { token, ticket } = this.tickets.issue({
      subject: claims.sub,
      idpId: idp.id,
      attributes: { ...mapped, oidc_access_token: tokens.access_token },
    });
    return { token, ticket, claims };
  }
}
