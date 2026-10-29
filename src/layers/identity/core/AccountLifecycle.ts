/**
 * AccountLifecycle
 *
 * Explicit finite-state machine for account status transitions.
 *
 * Legal transitions:
 *
 *   ACTIVE    -> LOCKED | SUSPENDED | DELETED
 *   LOCKED    -> ACTIVE (unlock) | SUSPENDED | DELETED
 *   SUSPENDED -> ACTIVE (reinstate) | DELETED
 *   DELETED   -> (terminal; no transitions out)
 *
 * DELETED is terminal: restore-from-delete would need a separate
 * tombstone-recovery flow and is intentionally disallowed here.
 *
 * The machine is a pure function table — `transition` mutates the passed
 * user and stamps `updatedAt`; `canAuthenticate` encapsulates the
 * read-side question callers ask before checking credentials.
 *
 * @module Identity/Core
 */

import { AccountStatus, User, IdentityCoreError, IdentityErrorCode } from './types';

/** Set of legal (from -> to) transitions. */
const LEGAL: ReadonlyMap<AccountStatus, ReadonlySet<AccountStatus>> = new Map([
  [AccountStatus.ACTIVE, new Set([AccountStatus.LOCKED, AccountStatus.SUSPENDED, AccountStatus.DELETED])],
  [AccountStatus.LOCKED, new Set([AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.DELETED])],
  [AccountStatus.SUSPENDED, new Set([AccountStatus.ACTIVE, AccountStatus.DELETED])],
  [AccountStatus.DELETED, new Set()],
]);

export class AccountLifecycle {
  /** Is `from -> to` a legal transition? */
  static canTransition(from: AccountStatus, to: AccountStatus): boolean {
    return LEGAL.get(from)?.has(to) ?? false;
  }

  /** All states reachable from `from`. */
  static reachable(from: AccountStatus): AccountStatus[] {
    return [...(LEGAL.get(from) ?? [])];
  }

  /**
   * Transition the user's status. Throws on illegal transitions.
   * Side effects:
   *  - transition into LOCKED stamps `lockedUntil` if a duration is given
   *  - transition into ACTIVE clears `failedLoginAttempts` and `lockedUntil`
   *  - transition into DELETED is recorded via status only
   */
  static transition(
    user: User,
    to: AccountStatus,
    now: number = Date.now(),
    lockDurationMs?: number
  ): User {
    if (!AccountLifecycle.canTransition(user.status, to)) {
      throw new IdentityCoreError(
        IdentityErrorCode.ILLEGAL_TRANSITION,
        `illegal account transition ${user.status} -> ${to}`,
        { userId: user.id, from: user.status, to }
      );
    }
    user.status = to;
    user.updatedAt = now;
    if (to === AccountStatus.LOCKED && lockDurationMs !== undefined) {
      user.lockedUntil = now + lockDurationMs;
    }
    if (to === AccountStatus.ACTIVE) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = undefined;
    }
    return user;
  }

  /**
   * If the user is LOCKED but the lock window has elapsed, lazily clear it.
   * Returns true if a lazy unlock happened.
   */
  static maybeAutoUnlock(user: User, now: number = Date.now()): boolean {
    if (user.status === AccountStatus.LOCKED && user.lockedUntil !== undefined && now >= user.lockedUntil) {
      user.status = AccountStatus.ACTIVE;
      user.lockedUntil = undefined;
      user.failedLoginAttempts = 0;
      user.updatedAt = now;
      return true;
    }
    return false;
  }

  /** Can the user authenticate right now (after lazy-unlock check)? */
  static canAuthenticate(user: User, now: number = Date.now()): boolean {
    AccountLifecycle.maybeAutoUnlock(user, now);
    return user.status === AccountStatus.ACTIVE;
  }
}
