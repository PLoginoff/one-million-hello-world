/**
 * ConsentStore — per-user attribute-release consent records.
 *
 * Tracks which attributes a user has consented to release to which SP.
 * The engine queries consent before applying the release policy:
 * policy decides what MAY go out; consent decides what the user
 * ALLOWED. Both must agree.
 *
 * Consent state per (userId, spEntityId): a set of consented attribute
 * names, a timestamp, and an optional expiry — re-consent required
 * after `expiresAt`.
 *
 * `filter` computes the effective release: intersection of
 * policy-released attributes and the consent set, plus the list of
 * attributes that needed consent but lacked it (for consent-prompt UI).
 *
 * @module IdentityProvider/Federation
 */

/** Persisted consent decision. */
export interface ConsentRecord {
  userId: string;
  spEntityId: string;
  /** Attribute names the user consented to release. */
  attributes: Set<string>;
  grantedAt: number;
  expiresAt?: number;
  /** If true, consent applies to future new attributes too. */
  rememberAll?: boolean;
}

export interface ConsentFilterResult {
  /** Attributes that pass both policy and consent. */
  allowed: Record<string, string[]>;
  /** Attribute names blocked by missing consent. */
  needsConsent: string[];
}

export class ConsentStore {
  private readonly _records: Map<string, ConsentRecord> = new Map();

  private static _key(userId: string, spEntityId: string): string {
    return `${userId}|${spEntityId}`;
  }

  /** Record a consent decision (replace prior). */
  grant(userId: string, spEntityId: string, attributes: string[], now: number = Date.now(), ttlMs?: number, rememberAll = false): ConsentRecord {
    const rec: ConsentRecord = {
      userId,
      spEntityId,
      attributes: new Set(attributes),
      grantedAt: now,
      expiresAt: ttlMs !== undefined ? now + ttlMs : undefined,
      rememberAll,
    };
    this._records.set(ConsentStore._key(userId, spEntityId), rec);
    return rec;
  }

  /** Revoke consent for a (user, sp) pair. */
  revoke(userId: string, spEntityId: string): boolean {
    return this._records.delete(ConsentStore._key(userId, spEntityId));
  }

  /** Current consent record if live (not expired). */
  current(userId: string, spEntityId: string, now: number = Date.now()): ConsentRecord | undefined {
    const rec = this._records.get(ConsentStore._key(userId, spEntityId));
    if (!rec) return undefined;
    if (rec.expiresAt !== undefined && now > rec.expiresAt) return undefined;
    return rec;
  }

  /**
   * Filter policy-released attributes through consent.
   * `rememberAll` consent admits everything; otherwise the attribute
   * must be explicitly listed.
   */
  filter(
    userId: string,
    spEntityId: string,
    released: Record<string, string[]>,
    now: number = Date.now()
  ): ConsentFilterResult {
    const rec = this.current(userId, spEntityId, now);
    const allowed: Record<string, string[]> = {};
    const needsConsent: string[] = [];
    for (const [name, values] of Object.entries(released)) {
      if (rec && (rec.rememberAll || rec.attributes.has(name))) {
        allowed[name] = values;
      } else {
        needsConsent.push(name);
      }
    }
    return { allowed, needsConsent };
  }

  /** All consent records for a user (DSR/portability export). */
  forUser(userId: string): ConsentRecord[] {
    return [...this._records.values()].filter((r) => r.userId === userId);
  }

  /** Purge expired consents. Returns count removed. */
  sweep(now: number = Date.now()): number {
    let n = 0;
    for (const [k, r] of this._records) {
      if (r.expiresAt !== undefined && now > r.expiresAt) {
        this._records.delete(k);
        n++;
      }
    }
    return n;
  }

  size(): number {
    return this._records.size;
  }
}
