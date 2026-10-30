/**
 * Logout Propagation — Single Logout with Backchannel Notifications
 *
 * Unlike `federation/SloCoordinator` (which walks session tickets and
 * fans out to IdPs), this module models *relying-party session* logout:
 *
 *   - A `SessionDirectory` tracks, per subject, every active session on
 *     every service (RP) — including which IdP brokered it.
 *   - On logout, the coordinator fans out backchannel `LogoutNotification`s
 *     to each RP endpoint (e.g. OIDC back-channel logout, SAML SLO over
 *     SOAP) with retry + exponential backoff, and records delivery
 *     status per RP.
 *   - Front-channel fallbacks (redirect iframes) are represented as
 *     'front-channel' endpoints that produce `LogoutRequestDescriptor`s
 *     for the caller to render rather than being delivered directly.
 *
 * Delivery semantics: at-least-once with per-endpoint retry budget and
 * idempotent delivery keys (logoutId + sessionId).
 *
 * @module Sso/Engine2
 */

/** How an RP wants to be told about logout. */
export type LogoutChannel = 'backchannel' | 'front-channel';

/** A registered relying party that holds sessions. */
export interface RelyingParty {
  readonly id: string;
  readonly channel: LogoutChannel;
  /** For backchannel: endpoint URL (opaque to the coordinator). */
  readonly endpoint?: string;
}

/** A live session an RP holds for a subject. */
export interface RpSession {
  readonly sessionId: string;
  readonly rpId: string;
  readonly subject: string;
  /** IdP that brokered the session (informational). */
  readonly idpId?: string;
  readonly createdAt: number;
}

/** One notification delivery attempt outcome. */
export interface DeliveryRecord {
  readonly logoutId: string;
  readonly sessionId: string;
  readonly rpId: string;
  readonly channel: LogoutChannel;
  readonly attempts: number;
  readonly delivered: boolean;
  readonly lastError?: string;
}

/** Front-channel descriptor — caller renders a redirect/iframe. */
export interface LogoutRequestDescriptor {
  readonly rpId: string;
  readonly sessionId: string;
  readonly subject: string;
  readonly logoutId: string;
}

/** Pluggable transport for backchannel POSTs. */
export interface ILogoutTransport {
  /** Returns true on success (HTTP 2xx / SOAP ack). */
  deliver(rp: RelyingParty, session: RpSession, logoutId: string): Promise<boolean>;
}

export interface LogoutOptions {
  /** Max delivery attempts per RP. Default 3. */
  readonly maxAttempts?: number;
  /** Base backoff in ms — doubles per attempt. Default 10. */
  readonly backoffBaseMs?: number;
}

/** Injectable sleep for tests. */
export type SleepFn = (ms: number) => Promise<void>;

export class LogoutPropagator {
  private readonly rps = new Map<string, RelyingParty>();
  private readonly sessions = new Map<string, RpSession>(); // sessionId → session
  private readonly deliveries: DeliveryRecord[] = [];
  private readonly deliveredKeys = new Set<string>(); // idempotency
  private readonly maxAttempts: number;
  private readonly backoffBase: number;
  private logoutSeq = 0;

  constructor(
    private readonly transport?: ILogoutTransport,
    options: LogoutOptions = {},
    private readonly clock: () => number = Date.now,
    private readonly sleep: SleepFn = () => Promise.resolve()
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffBase = options.backoffBaseMs ?? 10;
  }

  registerRp(rp: RelyingParty): void {
    this.rps.set(rp.id, rp);
  }

  removeRp(rpId: string): boolean {
    return this.rps.delete(rpId);
  }

  /** Record that an RP holds a session for a subject. */
  trackSession(session: Omit<RpSession, 'createdAt'>): RpSession {
    const s: RpSession = { ...session, createdAt: this.clock() };
    this.sessions.set(s.sessionId, s);
    return s;
  }

  /** Untrack a session (e.g. it expired naturally). */
  untrackSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** All sessions a subject holds across RPs. */
  sessionsFor(subject: string): readonly RpSession[] {
    const out: RpSession[] = [];
    for (const s of this.sessions.values()) if (s.subject === subject) out.push(s);
    return out;
  }

  /**
   * Propagate a subject logout to every RP holding a session for them.
   * Returns delivery records + front-channel descriptors for the caller.
   */
  async propagate(subject: string): Promise<{
    readonly logoutId: string;
    readonly records: readonly DeliveryRecord[];
    readonly frontChannel: readonly LogoutRequestDescriptor[];
  }> {
    const logoutId = `lo-${++this.logoutSeq}`;
    const sessions = this.sessionsFor(subject);
    const records: DeliveryRecord[] = [];
    const frontChannel: LogoutRequestDescriptor[] = [];

    for (const s of sessions) {
      const rp = this.rps.get(s.rpId);
      if (!rp) continue;
      const key = logoutId + ':' + s.sessionId;
      if (this.deliveredKeys.has(key)) continue; // idempotent re-run

      if (rp.channel === 'front-channel' || !rp.endpoint || !this.transport) {
        frontChannel.push({
          rpId: rp.id,
          sessionId: s.sessionId,
          subject,
          logoutId,
        });
        this.sessions.delete(s.sessionId);
        continue;
      }

      const rec = await this.deliverWithRetry(rp, s, logoutId);
      records.push(rec);
      if (rec.delivered) {
        this.deliveredKeys.add(key);
        this.sessions.delete(s.sessionId);
      }
    }
    return { logoutId, records, frontChannel };
  }

  /** Delivery audit trail. */
  deliveryLog(): readonly DeliveryRecord[] {
    return this.deliveries.slice();
  }

  private async deliverWithRetry(
    rp: RelyingParty,
    session: RpSession,
    logoutId: string
  ): Promise<DeliveryRecord> {
    let attempts = 0;
    let lastError: string | undefined;
    while (attempts < this.maxAttempts) {
      attempts++;
      try {
        const ok = await this.transport!.deliver(rp, session, logoutId);
        if (ok) {
          const rec: DeliveryRecord = {
            logoutId,
            sessionId: session.sessionId,
            rpId: rp.id,
            channel: 'backchannel',
            attempts,
            delivered: true,
          };
          this.deliveries.push(rec);
          return rec;
        }
        lastError = 'transport returned failure';
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempts < this.maxAttempts) {
        await this.sleep(this.backoffBase * 2 ** (attempts - 1));
      }
    }
    const rec: DeliveryRecord = {
      logoutId,
      sessionId: session.sessionId,
      rpId: rp.id,
      channel: 'backchannel',
      attempts,
      delivered: false,
      lastError,
    };
    this.deliveries.push(rec);
    return rec;
  }
}
