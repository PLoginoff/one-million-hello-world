/**
 * ConsentManager — GDPR-grade consent records with versioning.
 *
 * Distinct from the federation `ConsentStore` (which records attribute-
 * release decisions per SP): this module manages PURPOSE consent under
 * GDPR semantics — lawful-basis records that must be:
 *
 *   - PURPOSE-SCOPED: consent for 'marketing' never covers 'analytics'.
 *   - VERSIONED: when a policy document changes (new privacy policy
 *     version), previously granted consent does NOT silently carry
 *     forward — it must be re-collected under the new version, or the
 *     record is marked `stale`.
 *   - EVIDENCED: each record captures when, how (UX surface), and the
 *     exact policy text version the user saw.
 *   - REVOCABLE with AUDIT TRAIL: withdrawal is as easy as grant
 *     (GDPR Art. 7(3)); every transition is journaled.
 *
 * States per (user, purpose): none → granted → withdrawn | stale →
 * re-granted. `check()` answers the runtime question "is there current
 * valid consent for this purpose under policy version V?"
 *
 * @module Identity/Engine2
 */

// ------------------------------------------------------------------ types

/** Lifecycle status of a consent record. */
export enum ConsentStatus {
  GRANTED = 'granted',
  WITHDRAWN = 'withdrawn',
  /** Policy version moved on; consent needs re-collection. */
  STALE = 'stale',
  /** Expired per TTL. */
  EXPIRED = 'expired',
}

/** One consent decision event (append-only journal). */
export interface ConsentEvent {
  readonly at: number;
  readonly action: 'grant' | 'withdraw' | 'mark_stale' | 'regrant' | 'expire';
  /** Policy version the action was made under. */
  readonly policyVersion: string;
  /** UX surface ('settings', 'signup-checkbox', 'support-ticket'). */
  readonly surface?: string;
  readonly detail?: string;
}

/** Consent record for one (user, purpose) pair. */
export interface ConsentRecordV2 {
  readonly userId: string;
  readonly purpose: string;
  status: ConsentStatus;
  /** Policy version the current grant was made under. */
  policyVersion?: string;
  grantedAt?: number;
  withdrawnAt?: number;
  /** If set, grant lapses at this time even without withdrawal. */
  expiresAt?: number;
  /** Append-only journal of every transition. */
  readonly journal: ConsentEvent[];
}

/** Result of a consent check. */
export interface ConsentCheck {
  readonly allowed: boolean;
  readonly status: ConsentStatus | 'none';
  /** Why consent is absent — drives re-prompt UX. */
  readonly reason?: 'never_granted' | 'withdrawn' | 'stale_version' | 'expired';
  readonly record?: ConsentRecordV2;
}

// ------------------------------------------------------------------ manager

export class ConsentManager {
  private readonly _records = new Map<string, ConsentRecordV2>();
  private readonly _now: () => number;
  /** Current policy version per purpose — bumps invalidate grants. */
  private readonly _currentVersions = new Map<string, string>();

  constructor(now: () => number = Date.now) {
    this._now = now;
  }

  private static _key(userId: string, purpose: string): string {
    return `${userId}|${purpose}`;
  }

  /** Bump the current policy version for a purpose. */
  setPolicyVersion(purpose: string, version: string): void {
    this._currentVersions.set(purpose, version);
  }

  currentPolicyVersion(purpose: string): string | undefined {
    return this._currentVersions.get(purpose);
  }

  /**
   * Record consent for a purpose under `policyVersion` (defaults to the
   * registered current version). Re-granting an existing record is a
   * 'regrant' event preserving the journal.
   */
  grant(
    userId: string,
    purpose: string,
    options: { policyVersion?: string; surface?: string; ttlMs?: number; detail?: string } = {},
  ): ConsentRecordV2 {
    const now = this._now();
    const key = ConsentManager._key(userId, purpose);
    const version = options.policyVersion ?? this._currentVersions.get(purpose) ?? 'v1';
    let rec = this._records.get(key);
    if (!rec) {
      rec = {
        userId,
        purpose,
        status: ConsentStatus.GRANTED,
        journal: [],
      };
      this._records.set(key, rec);
    }
    const action: ConsentEvent['action'] = rec.status === ConsentStatus.GRANTED ? 'grant' : 'regrant';
    rec.status = ConsentStatus.GRANTED;
    rec.policyVersion = version;
    rec.grantedAt = now;
    rec.withdrawnAt = undefined;
    rec.expiresAt = options.ttlMs !== undefined ? now + options.ttlMs : undefined;
    rec.journal.push({ at: now, action, policyVersion: version, surface: options.surface, detail: options.detail });
    return rec;
  }

  /** Withdraw consent — journal-preserved, status → WITHDRAWN. */
  withdraw(userId: string, purpose: string, detail?: string): ConsentRecordV2 {
    const rec = this._records.get(ConsentManager._key(userId, purpose));
    if (!rec) throw new Error(`No consent record for ${userId}/${purpose}`);
    const now = this._now();
    rec.status = ConsentStatus.WITHDRAWN;
    rec.withdrawnAt = now;
    rec.journal.push({ at: now, action: 'withdraw', policyVersion: rec.policyVersion ?? '', detail });
    return rec;
  }

  /**
   * Mark every grant under an outdated policy version as STALE.
   * Called when a privacy policy ships a new version; returns the
   * records needing re-collection.
   */
  staleSweep(purpose: string, newVersion: string): ConsentRecordV2[] {
    const now = this._now();
    this._currentVersions.set(purpose, newVersion);
    const stale: ConsentRecordV2[] = [];
    for (const rec of this._records.values()) {
      if (rec.purpose !== purpose || rec.status !== ConsentStatus.GRANTED) continue;
      if (rec.policyVersion !== newVersion) {
        rec.status = ConsentStatus.STALE;
        rec.journal.push({ at: now, action: 'mark_stale', policyVersion: rec.policyVersion ?? '', detail: `superseded by ${newVersion}` });
        stale.push(rec);
      }
    }
    return stale;
  }

  /**
   * Runtime check: is consent for (user, purpose) currently valid?
   * Lazily expires TTL'd grants and stale-checks the policy version.
   */
  check(userId: string, purpose: string): ConsentCheck {
    const rec = this._records.get(ConsentManager._key(userId, purpose));
    const now = this._now();
    if (!rec) return { allowed: false, status: 'none', reason: 'never_granted' };

    if (rec.status === ConsentStatus.GRANTED) {
      // Lazy expiry.
      if (rec.expiresAt !== undefined && now > rec.expiresAt) {
        rec.status = ConsentStatus.EXPIRED;
        rec.journal.push({ at: now, action: 'expire', policyVersion: rec.policyVersion ?? '' });
        return { allowed: false, status: ConsentStatus.EXPIRED, reason: 'expired', record: rec };
      }
      // Stale check — consent was given under an older policy version.
      const cur = this._currentVersions.get(purpose);
      if (cur !== undefined && rec.policyVersion !== cur) {
        rec.status = ConsentStatus.STALE;
        rec.journal.push({ at: now, action: 'mark_stale', policyVersion: rec.policyVersion ?? '', detail: `superseded by ${cur}` });
        return { allowed: false, status: ConsentStatus.STALE, reason: 'stale_version', record: rec };
      }
      return { allowed: true, status: ConsentStatus.GRANTED, record: rec };
    }

    switch (rec.status) {
      case ConsentStatus.WITHDRAWN:
        return { allowed: false, status: rec.status, reason: 'withdrawn', record: rec };
      case ConsentStatus.STALE:
        return { allowed: false, status: rec.status, reason: 'stale_version', record: rec };
      case ConsentStatus.EXPIRED:
        return { allowed: false, status: rec.status, reason: 'expired', record: rec };
      default:
        return { allowed: false, status: rec.status, reason: 'never_granted', record: rec };
    }
  }

  /** All records for a user — supports GDPR data-export requests. */
  recordsFor(userId: string): ConsentRecordV2[] {
    return [...this._records.values()].filter((r) => r.userId === userId);
  }

  /** Full journal for one record — audit evidence. */
  journal(userId: string, purpose: string): ConsentEvent[] {
    return this._records.get(ConsentManager._key(userId, purpose))?.journal ?? [];
  }
}
