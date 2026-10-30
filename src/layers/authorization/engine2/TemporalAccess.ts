/**
 * Time-Based Access Control
 *
 * Two complementary primitives:
 *
 *  - AccessWindow — recurring daily windows ("analysts may read
 *    prod-data 09:00–17:00 UTC"). Overnight windows (22:00→06:00) are
 *    supported via wrap-around comparison.
 *  - TemporaryGrant — self-expiring permissions ("break-glass access
 *    for 2h"). Expired grants are invisible to `isActive` and lazily
 *    pruned by `sweep`.
 *
 * Both are pure functions of the injected clock — deterministic tests.
 *
 * @module AuthorizationLayer/Engine2
 */

import {
  AccessWindow,
  AuthzClock,
  ManualAuthzClock,
  SystemAuthzClock,
  TemporaryGrant,
} from './types';

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = MINUTES_PER_DAY * 60_000;

/** Minutes since UTC midnight for an epoch-ms timestamp. */
export function minuteOfDay(nowMs: number): number {
  const day = ((nowMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return Math.floor(day / 60_000);
}

/** Is `minute` inside the (possibly overnight) window? */
export function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false; // empty window
  if (start < end) return minute >= start && minute < end;
  // Overnight: 22:00 → 06:00 wraps past midnight.
  return minute >= start || minute < end;
}

export class TemporalAccessControl {
  private readonly _windows: AccessWindow[] = [];
  private readonly _grants = new Map<string, TemporaryGrant>();
  private readonly _clock: AuthzClock;
  private _seq = 0;

  constructor(clock?: AuthzClock) {
    this._clock = clock ?? new SystemAuthzClock();
  }

  // ----------------------------------------------------------- windows

  addWindow(w: AccessWindow): void {
    if (w.startMinuteOfDay < 0 || w.startMinuteOfDay >= MINUTES_PER_DAY) {
      throw new Error(`invalid startMinuteOfDay ${w.startMinuteOfDay}`);
    }
    if (w.endMinuteOfDay < 0 || w.endMinuteOfDay >= MINUTES_PER_DAY) {
      throw new Error(`invalid endMinuteOfDay ${w.endMinuteOfDay}`);
    }
    this._windows.push(w);
  }

  removeWindow(id: string): boolean {
    const idx = this._windows.findIndex((w) => w.id === id);
    if (idx < 0) return false;
    this._windows.splice(idx, 1);
    return true;
  }

  /**
   * Is `subjectId` inside any window granting `permission` right now?
   * Windows outside their optional epoch bounds are skipped.
   */
  inAccessWindow(subjectId: string, permission: string): boolean {
    const now = this._clock.now();
    const minute = minuteOfDay(now);
    for (const w of this._windows) {
      if (w.subjectId !== subjectId) continue;
      if (w.permission !== permission && w.permission !== '*') continue;
      if (w.validFromMs !== undefined && now < w.validFromMs) continue;
      if (w.validUntilMs !== undefined && now >= w.validUntilMs) continue;
      if (inWindow(minute, w.startMinuteOfDay, w.endMinuteOfDay)) return true;
    }
    return false;
  }

  /** Windows applicable to a subject (for admin UIs / audit). */
  windowsFor(subjectId: string): readonly AccessWindow[] {
    return this._windows.filter((w) => w.subjectId === subjectId);
  }

  // ------------------------------------------------------------ grants

  /** Issue a temporary grant; returns the stored record. */
  grantTemporary(
    subjectId: string,
    permission: string,
    ttlMs: number,
    grantedBy?: string,
    reason?: string
  ): TemporaryGrant {
    const now = this._clock.now();
    const g: TemporaryGrant = {
      id: `tg-${++this._seq}`,
      subjectId,
      permission,
      grantedAtMs: now,
      expiresAtMs: now + ttlMs,
      grantedBy,
      reason,
    };
    this._grants.set(g.id, g);
    return g;
  }

  revokeGrant(id: string): boolean {
    return this._grants.delete(id);
  }

  /** Does the subject hold a live temporary grant for `permission`? */
  hasActiveGrant(subjectId: string, permission: string): boolean {
    const now = this._clock.now();
    for (const g of this._grants.values()) {
      if (g.subjectId !== subjectId) continue;
      if (g.permission !== permission && g.permission !== '*') continue;
      if (g.expiresAtMs > now) return true;
    }
    return false;
  }

  /** All live grants for a subject. */
  activeGrants(subjectId: string): readonly TemporaryGrant[] {
    const now = this._clock.now();
    return [...this._grants.values()].filter(
      (g) => g.subjectId === subjectId && g.expiresAtMs > now
    );
  }

  /** Remove expired grants — call periodically to bound memory. */
  sweep(): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [id, g] of this._grants) {
      if (g.expiresAtMs <= now) {
        this._grants.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Unified temporal check: either an active window OR a live temporary
   * grant suffices.
   */
  isAllowed(subjectId: string, permission: string): boolean {
    return this.inAccessWindow(subjectId, permission) || this.hasActiveGrant(subjectId, permission);
  }
}

export { ManualAuthzClock };
