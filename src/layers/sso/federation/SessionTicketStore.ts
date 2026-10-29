/**
 * SessionTicketStore — issues, validates and consumes SSO session tickets.
 *
 * Tickets are one-time-use opaque tokens exchanged for a local session.
 */

import { createHash, randomBytes } from 'crypto';
import { SessionTicket, SsoFederationError } from './types';

interface StoredTicket extends SessionTicket {
  tokenHash: string;
}

export class SessionTicketStore {
  private tickets = new Map<string, StoredTicket>();
  private bySubject = new Map<string, Set<string>>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(opts: { now?: () => number; ttlMs?: number } = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000; // 5 min
  }

  /** Issue a ticket. Returns the raw token + stored ticket record. */
  issue(input: {
    subject: string;
    idpId: string;
    idpSessionIndex?: string;
    attributes?: Record<string, unknown>;
    ttlMs?: number;
  }): { token: string; ticket: SessionTicket } {
    const nowMs = this.now();
    const token = `st-${randomBytes(24).toString('hex')}`;
    const ticket: StoredTicket = {
      id: `tkt-${randomBytes(8).toString('hex')}`,
      subject: input.subject,
      idpId: input.idpId,
      idpSessionIndex: input.idpSessionIndex,
      attributes: input.attributes ?? {},
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + (input.ttlMs ?? this.ttlMs),
      consumed: false,
      tokenHash: this.hash(token),
    };
    this.tickets.set(ticket.tokenHash, ticket);
    let bySubject = this.bySubject.get(ticket.subject);
    if (!bySubject) {
      bySubject = new Set();
      this.bySubject.set(ticket.subject, bySubject);
    }
    bySubject.add(ticket.tokenHash);
    return { token, ticket: this.publicView(ticket) };
  }

  /** Consume a ticket exactly once. Throws on reuse or expiry. */
  consume(token: string): SessionTicket {
    const t = this.tickets.get(this.hash(token));
    if (!t) {
      throw new SsoFederationError('session_unknown', 'Unknown session ticket');
    }
    if (t.consumed) {
      throw new SsoFederationError('ticket_consumed', 'Ticket already used');
    }
    if (t.expiresAtMs <= this.now()) {
      this.delete(t);
      throw new SsoFederationError('session_expired', 'Ticket expired');
    }
    t.consumed = true;
    return this.publicView(t);
  }

  /** Peek without consuming. */
  peek(token: string): SessionTicket | null {
    const t = this.tickets.get(this.hash(token));
    if (!t || t.consumed || t.expiresAtMs <= this.now()) return null;
    return this.publicView(t);
  }

  /** All tickets (consumed or not) belonging to a subject — for SLO. */
  forSubject(subject: string): SessionTicket[] {
    const set = this.bySubject.get(subject);
    if (!set) return [];
    const out: SessionTicket[] = [];
    for (const h of set) {
      const t = this.tickets.get(h);
      if (t) out.push(this.publicView(t));
    }
    return out;
  }

  /** Revoke all tickets for a subject (single sign-off). Returns count. */
  revokeForSubject(subject: string): number {
    const set = this.bySubject.get(subject);
    if (!set) return 0;
    let n = 0;
    for (const h of set) {
      const t = this.tickets.get(h);
      if (t) {
        this.delete(t);
        n++;
      }
    }
    this.bySubject.delete(subject);
    return n;
  }

  /** Revoke all tickets matching an IdP session index (SLO via back-channel). */
  revokeByIdpSession(idpId: string, sessionIndex: string): number {
    let n = 0;
    for (const t of this.tickets.values()) {
      if (t.idpId === idpId && t.idpSessionIndex === sessionIndex) {
        this.delete(t);
        n++;
      }
    }
    return n;
  }

  /** Drop expired tickets. */
  prune(): number {
    const now = this.now();
    let n = 0;
    for (const t of this.tickets.values()) {
      if (t.expiresAtMs <= now) {
        this.delete(t);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    this.prune();
    return this.tickets.size;
  }

  /* ---------------------------------------------------------------- */

  private delete(t: StoredTicket): void {
    this.tickets.delete(t.tokenHash);
    const set = this.bySubject.get(t.subject);
    if (set) {
      set.delete(t.tokenHash);
      if (set.size === 0) this.bySubject.delete(t.subject);
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicView(t: StoredTicket): SessionTicket {
    const { tokenHash: _h, ...rest } = t;
    void _h;
    return { ...rest };
  }
}
