/**
 * SloCoordinator — single sign-off orchestration.
 *
 * When a user logs out (locally or via IdP back-channel), we must:
 *   1. Revoke local session tickets for the subject.
 *   2. Optionally propagate a LogoutRequest to each federated IdP that
 *      still has an active session for the subject.
 */

import { IdentityProvider, SsoFederationError } from './types';
import { SessionTicketStore } from './SessionTicketStore';
import { IdpRegistry } from './IdpRegistry';

export interface SloTransport {
  /** Send a LogoutRequest to an IdP. Returns true on 2xx. */
  sendLogoutRequest(
    idp: IdentityProvider,
    params: { subject: string; sessionIndex?: string }
  ): Promise<boolean>;
}

export interface SloResult {
  subject: string;
  localTicketsRevoked: number;
  idpsNotified: string[];
  idpFailures: Array<{ idpId: string; error: string }>;
}

export class SloCoordinator {
  constructor(
    private readonly tickets: SessionTicketStore,
    private readonly registry: IdpRegistry,
    private readonly transport?: SloTransport
  ) {}

  /**
   * Local logout — revoke all the subject's tickets and notify IdPs that
   * support SLO.
   */
  async logoutSubject(subject: string): Promise<SloResult> {
    const tickets = this.tickets.forSubject(subject);
    const revoked = this.tickets.revokeForSubject(subject);

    const notified: string[] = [];
    const failures: SloResult['idpFailures'] = [];
    if (this.transport) {
      // Deduplicate IdPs and fan out LogoutRequest to each with an sloUrl.
      const seen = new Set<string>();
      for (const t of tickets) {
        if (seen.has(t.idpId)) continue;
        seen.add(t.idpId);
        let idp: IdentityProvider;
        try {
          idp = this.registry.get(t.idpId);
        } catch {
          continue; // IdP no longer registered — skip
        }
        if (!idp.sloUrl) continue;
        try {
          const ok = await this.transport.sendLogoutRequest(idp, {
            subject,
            sessionIndex: t.idpSessionIndex,
          });
          if (ok) notified.push(idp.id);
          else failures.push({ idpId: idp.id, error: 'non-2xx response' });
        } catch (err) {
          failures.push({ idpId: idp.id, error: (err as Error).message });
        }
      }
    }
    return { subject, localTicketsRevoked: revoked, idpsNotified: notified, idpFailures: failures };
  }

  /**
   * Back-channel logout — IdP calls us with a SessionIndex to terminate.
   */
  async handleBackChannelLogout(idpId: string, sessionIndex: string): Promise<number> {
    // Confirm the IdP exists — otherwise reject the request.
    if (!this.registry.has(idpId)) {
      throw new SsoFederationError('unknown_idp', `Unknown IdP in SLO request: ${idpId}`);
    }
    return this.tickets.revokeByIdpSession(idpId, sessionIndex);
  }
}
