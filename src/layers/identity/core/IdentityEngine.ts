/**
 * IdentityEngine
 *
 * Facade orchestrating the identity core primitives:
 *
 *   IdentityStore            — unique-indexed user repository
 *   PasswordHasher           — scrypt credential hashing
 *   PasswordPolicyEngine     — length/complexity/history/breach checks
 *   AccountLifecycle         — status FSM (active/locked/suspended/deleted)
 *   VerificationTokenStore   — single-use TTL tokens
 *   SessionRegistry          — per-user bounded sessions
 *
 * Responsibilities beyond the primitives:
 *  - Registration with policy enforcement + credential history seeding
 *  - Authentication with constant-time-ish behavior on unknown users,
 *    failed-attempt accounting, and automatic lockout
 *  - Password change/reset with history enforcement and session
 *    invalidation
 *  - Email/phone verification flows via tokens
 *  - Identity merge: duplicate-account detection by shared contact
 *    points and consolidation into a surviving account
 *
 * @module Identity/Core
 */

import { randomBytes } from 'crypto';
import {
  User,
  PublicUser,
  RegisterInput,
  AuthResult,
  AuthResultCode,
  AccountStatus,
  TokenPurpose,
  MergeCandidate,
  MergeMatchKind,
  MergeResult,
  PasswordCheckResult,
  PasswordCredential,
  Session,
  IdentityEngineConfig,
  DEFAULT_IDENTITY_ENGINE_CONFIG,
  IdentityCoreError,
  IdentityErrorCode,
  toPublicUser,
} from './types';
import { IdentityStore, normalizeEmail, normalizePhone } from './IdentityStore';
import { PasswordHasher } from './PasswordHasher';
import { PasswordPolicyEngine } from './PasswordPolicyEngine';
import { AccountLifecycle } from './AccountLifecycle';
import { VerificationTokenStore } from './VerificationTokenStore';
import { SessionRegistry } from './SessionRegistry';

export class IdentityEngine {
  private readonly _store: IdentityStore;
  private readonly _hasher: PasswordHasher;
  private readonly _policy: PasswordPolicyEngine;
  private readonly _tokens: VerificationTokenStore;
  private readonly _sessions: SessionRegistry;
  private readonly _config: IdentityEngineConfig;
  /** userId -> password credential history (current + previous). */
  private readonly _history: Map<string, PasswordCredential[]> = new Map();
  /** Deterministic clock hook for tests. */
  private readonly _now: () => number;

  constructor(config?: Partial<IdentityEngineConfig>, now: () => number = Date.now) {
    this._config = {
      ...DEFAULT_IDENTITY_ENGINE_CONFIG,
      ...config,
      passwordPolicy: { ...DEFAULT_IDENTITY_ENGINE_CONFIG.passwordPolicy, ...config?.passwordPolicy },
      scrypt: { ...DEFAULT_IDENTITY_ENGINE_CONFIG.scrypt, ...config?.scrypt },
    };
    this._store = new IdentityStore();
    this._hasher = new PasswordHasher(this._config.scrypt);
    this._policy = new PasswordPolicyEngine(this._hasher);
    this._tokens = new VerificationTokenStore();
    this._sessions = new SessionRegistry(this._config.maxSessionsPerUser);
    this._now = now;
  }

  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  /**
   * Register a new identity. Enforces username/email/phone uniqueness,
   * validates the password against the policy engine (with user-info
   * checks against the would-be username/email), and hashes via scrypt.
   *
   * New accounts start ACTIVE but unverified — callers issue
   * verification tokens to confirm email/phone.
   */
  register(input: RegisterInput): PublicUser {
    const username = input.username.trim();
    if (username.length < 3) {
      throw new IdentityCoreError(IdentityErrorCode.WEAK_PASSWORD, 'username must be at least 3 characters');
    }
    const email = input.email?.trim().toLowerCase();
    const phone = input.phone !== undefined ? normalizePhone(input.phone) : undefined;

    const now = this._now();
    const pseudo: Pick<User, 'username' | 'email' | 'profile'> = {
      username,
      email,
      profile: { attributes: {}, ...input.profile },
    };
    const check = this._policy.check(input.password, this._config.passwordPolicy, pseudo, []);
    if (!check.ok) {
      throw new IdentityCoreError(
        IdentityErrorCode.WEAK_PASSWORD,
        `password rejected: ${check.violations.map((v) => v.message).join('; ')}`,
        { violations: check.violations }
      );
    }

    const user: User = {
      id: `usr_${randomBytes(12).toString('base64url')}`,
      username,
      email,
      phone,
      status: AccountStatus.ACTIVE,
      credential: this._hasher.hash(input.password, now),
      profile: { attributes: {}, ...input.profile },
      emailVerified: false,
      phoneVerified: false,
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };
    this._store.insert(user);
    this._history.set(user.id, [user.credential!]);
    return toPublicUser(user);
  }

  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------

  /**
   * Authenticate by username-or-email + password.
   *
   * To reduce user-enumeration signal, unknown users still pay a scrypt
   * verification against a fixed dummy credential, so timing does not
   * trivially reveal account existence.
   *
   * Failed attempts increment a counter; reaching `lockoutThreshold`
   * transitions the account to LOCKED for `lockoutDurationMs`.
   */
  authenticate(login: string, password: string): AuthResult {
    const now = this._now();
    const user = login.includes('@')
      ? this._store.getByEmail(login)
      : this._store.getByUsername(login);

    if (!user || user.mergedInto !== undefined) {
      // Pay comparable hashing cost to blunt timing enumeration.
      this._hasher.verify(password, DUMMY_CREDENTIAL);
      return { code: AuthResultCode.UNKNOWN_USER };
    }

    if (!AccountLifecycle.canAuthenticate(user, now)) {
      const code =
        user.status === AccountStatus.LOCKED
          ? AuthResultCode.LOCKED
          : user.status === AccountStatus.SUSPENDED
            ? AuthResultCode.SUSPENDED
            : AuthResultCode.DELETED;
      return { code };
    }

    if (!user.credential || !this._hasher.verify(password, user.credential)) {
      user.failedLoginAttempts++;
      user.updatedAt = now;
      if (user.failedLoginAttempts >= this._config.lockoutThreshold) {
        AccountLifecycle.transition(user, AccountStatus.LOCKED, now, this._config.lockoutDurationMs);
        return { code: AuthResultCode.LOCKED };
      }
      return { code: AuthResultCode.BAD_CREDENTIALS };
    }

    // Success path: reset failure counter, transparent rehash if the
    // stored credential was computed with weaker params.
    user.failedLoginAttempts = 0;
    if (this._hasher.needsRehash(user.credential)) {
      user.credential = this._hasher.hash(password, now);
      const hist = this._history.get(user.id) ?? [];
      hist[hist.length - 1] = user.credential;
      this._history.set(user.id, hist);
    }
    user.updatedAt = now;

    const { session } = this._sessions.create(user.id, now);
    return { code: AuthResultCode.SUCCESS, session, user: toPublicUser(user) };
  }

  /** Validate a session id; returns the owning public user. */
  resolveSession(sessionId: string): { user: PublicUser; session: Session } | undefined {
    const s = this._sessions.get(sessionId, this._now());
    if (!s) return undefined;
    const user = this._store.getById(s.userId);
    if (!user || !AccountLifecycle.canAuthenticate(user, this._now())) return undefined;
    this._sessions.touch(sessionId, this._now());
    return { user: toPublicUser(user), session: s };
  }

  /** Logout — revoke one session. */
  logout(sessionId: string): boolean {
    return this._sessions.revoke(sessionId);
  }

  /** Revoke all sessions for a user (global logout / security event). */
  logoutAll(userId: string): number {
    return this._sessions.revokeAllForUser(userId);
  }

  /** Live sessions for a user. */
  sessionsForUser(userId: string): Session[] {
    return this._sessions.sessionsForUser(userId, this._now());
  }

  // ------------------------------------------------------------------
  // Password management
  // ------------------------------------------------------------------

  /** Evaluate a password candidate for a user without changing state. */
  checkPassword(userId: string, candidate: string): PasswordCheckResult {
    const user = this._store.requireById(userId);
    return this._policy.check(candidate, this._config.passwordPolicy, user, this._history.get(userId) ?? []);
  }

  /**
   * Change password with proof of the current one. Enforces policy +
   * history, then revokes all other sessions (keep `keepSessionId`).
   */
  changePassword(userId: string, current: string, next: string, keepSessionId?: string): void {
    const user = this._store.requireById(userId);
    if (!user.credential || !this._hasher.verify(current, user.credential)) {
      throw new IdentityCoreError(IdentityErrorCode.WEAK_PASSWORD, 'current password incorrect');
    }
    this._setPassword(user, next);
    // Invalidate sessions except the caller's
    for (const s of this._sessions.sessionsForUser(userId, this._now())) {
      if (s.id !== keepSessionId) this._sessions.revoke(s.id);
    }
  }

  /**
   * Begin a password-reset flow: issue a token for out-of-band delivery.
   */
  beginPasswordReset(userId: string): { token: string; expiresAt: number } {
    const user = this._store.requireById(userId);
    const t = this._tokens.issue(user.id, TokenPurpose.PASSWORD_RESET, user.email ?? '', this._config.tokenTtlMs, this._now());
    return { token: t.token, expiresAt: t.expiresAt };
  }

  /**
   * Complete a password reset: consume the token, set the new password,
   * revoke every session (a reset implies possible compromise).
   */
  completePasswordReset(token: string, newPassword: string): PublicUser {
    const t = this._tokens.consume(token, TokenPurpose.PASSWORD_RESET, this._now());
    const user = this._store.requireById(t.userId);
    this._setPassword(user, newPassword);
    this._sessions.revokeAllForUser(user.id);
    // Auto-unlock a lockout — the legitimate owner proved email access.
    if (user.status === AccountStatus.LOCKED) {
      AccountLifecycle.transition(user, AccountStatus.ACTIVE, this._now());
    }
    return toPublicUser(user);
  }

  /** Shared password-set path with policy + history enforcement. */
  private _setPassword(user: User, next: string): void {
    const history = this._history.get(user.id) ?? [];
    const check = this._policy.check(next, this._config.passwordPolicy, user, history);
    if (!check.ok) {
      throw new IdentityCoreError(
        IdentityErrorCode.WEAK_PASSWORD,
        `password rejected: ${check.violations.map((v) => v.message).join('; ')}`,
        { violations: check.violations }
      );
    }
    const cred = this._hasher.hash(next, this._now());
    user.credential = cred;
    user.updatedAt = this._now();
    history.push(cred);
    // Retain only the most recent historySize + 1 credentials.
    const keep = this._config.passwordPolicy.historySize + 1;
    this._history.set(user.id, history.slice(-keep));
  }

  // ------------------------------------------------------------------
  // Verification tokens
  // ------------------------------------------------------------------

  /** Issue an email-verification token for a user's current email. */
  issueEmailVerification(userId: string): { token: string; expiresAt: number } {
    const user = this._store.requireById(userId);
    if (!user.email) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, 'user has no email');
    }
    const t = this._tokens.issue(user.id, TokenPurpose.EMAIL_VERIFICATION, user.email, this._config.tokenTtlMs, this._now());
    return { token: t.token, expiresAt: t.expiresAt };
  }

  /** Consume an email-verification token; marks the user emailVerified. */
  confirmEmail(token: string): PublicUser {
    const t = this._tokens.consume(token, TokenPurpose.EMAIL_VERIFICATION, this._now());
    const user = this._store.requireById(t.userId);
    user.emailVerified = true;
    user.updatedAt = this._now();
    return toPublicUser(user);
  }

  /** Issue a phone-verification token. */
  issuePhoneVerification(userId: string): { token: string; expiresAt: number } {
    const user = this._store.requireById(userId);
    if (!user.phone) {
      throw new IdentityCoreError(IdentityErrorCode.TOKEN_INVALID, 'user has no phone');
    }
    const t = this._tokens.issue(user.id, TokenPurpose.PHONE_VERIFICATION, user.phone, this._config.tokenTtlMs, this._now());
    return { token: t.token, expiresAt: t.expiresAt };
  }

  /** Consume a phone-verification token. */
  confirmPhone(token: string): PublicUser {
    const t = this._tokens.consume(token, TokenPurpose.PHONE_VERIFICATION, this._now());
    const user = this._store.requireById(t.userId);
    user.phoneVerified = true;
    user.updatedAt = this._now();
    return toPublicUser(user);
  }

  // ------------------------------------------------------------------
  // Lifecycle administration
  // ------------------------------------------------------------------

  /** Suspend an account and kill all its sessions. */
  suspend(userId: string): PublicUser {
    const user = this._store.requireById(userId);
    AccountLifecycle.transition(user, AccountStatus.SUSPENDED, this._now());
    this._sessions.revokeAllForUser(userId);
    return toPublicUser(user);
  }

  /** Reinstate a suspended or locked account. */
  activate(userId: string): PublicUser {
    const user = this._store.requireById(userId);
    AccountLifecycle.transition(user, AccountStatus.ACTIVE, this._now());
    return toPublicUser(user);
  }

  /** Soft-delete: tombstone the account and kill sessions. Terminal. */
  deleteAccount(userId: string): PublicUser {
    const user = this._store.requireById(userId);
    AccountLifecycle.transition(user, AccountStatus.DELETED, this._now());
    this._sessions.revokeAllForUser(userId);
    return toPublicUser(user);
  }

  /** Manual unlock (e.g. helpdesk after identity proof). */
  unlock(userId: string): PublicUser {
    const user = this._store.requireById(userId);
    AccountLifecycle.transition(user, AccountStatus.ACTIVE, this._now());
    return toPublicUser(user);
  }

  // ------------------------------------------------------------------
  // Identity merge
  // ------------------------------------------------------------------

  /**
   * Find accounts that probably belong to the same real-world person:
   * shared normalized email (1.0), shared normalized phone (0.9), or
   * same username on a different contact point (0.5). Deleted accounts
   * and the user itself are excluded.
   */
  findMergeCandidates(userId: string): MergeCandidate[] {
    const user = this._store.requireById(userId);
    const out: MergeCandidate[] = [];
    const seen = new Set<string>([userId]);

    const push = (u: User | undefined, match: MergeMatchKind, confidence: number): void => {
      if (!u || seen.has(u.id) || u.status === AccountStatus.DELETED) return;
      seen.add(u.id);
      out.push({ userId: u.id, match, confidence });
    };

    if (user.email) push(this._store.getByEmail(user.email), MergeMatchKind.SAME_EMAIL, 1.0);
    if (user.phone) push(this._store.getByPhone(user.phone), MergeMatchKind.SAME_PHONE, 0.9);
    // Username equality across accounts can't happen via the unique index,
    // but a case-variant or a merged-away account may still surface here.
    const byName = this._store.getByUsername(user.username);
    if (byName && byName.id !== userId) push(byName, MergeMatchKind.SAME_USERNAME, 0.5);
    return out.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Merge `secondaryId` into `primaryId`. The primary survives; the
   * secondary is marked DELETED with `mergedInto` pointing at the
   * primary. Fields the primary lacks (email/phone/profile attributes)
   * are adopted; secondary sessions are re-pointed at the primary.
   *
   * The secondary's contact points are copied onto the primary ONLY if
   * the primary lacks them; otherwise they are released from the index
   * (the secondary is removed from indexes entirely).
   */
  merge(primaryId: string, secondaryId: string): MergeResult {
    if (primaryId === secondaryId) {
      throw new IdentityCoreError(IdentityErrorCode.MERGE_SELF, 'cannot merge a user into itself');
    }
    const primary = this._store.requireById(primaryId);
    const secondary = this._store.requireById(secondaryId);
    if (primary.status === AccountStatus.DELETED) {
      throw new IdentityCoreError(IdentityErrorCode.MERGE_TARGET_DELETED, 'primary is deleted');
    }
    const now = this._now();
    const adopted: string[] = [];

    if (!primary.email && secondary.email) {
      primary.email = secondary.email;
      primary.emailVerified = secondary.emailVerified;
      adopted.push('email');
    }
    if (!primary.phone && secondary.phone) {
      primary.phone = secondary.phone;
      primary.phoneVerified = secondary.phoneVerified;
      adopted.push('phone');
    }
    for (const [k, v] of Object.entries(secondary.profile.attributes)) {
      if (primary.profile.attributes[k] === undefined) {
        primary.profile.attributes[k] = v;
        adopted.push(`attributes.${k}`);
      }
    }
    for (const field of ['displayName', 'givenName', 'familyName', 'locale', 'timezone'] as const) {
      if (primary.profile[field] === undefined && secondary.profile[field] !== undefined) {
        primary.profile[field] = secondary.profile[field];
        adopted.push(`profile.${field}`);
      }
    }
    primary.updatedAt = now;

    const sessionsReassigned = this._sessions.reassign(secondaryId, primaryId);

    // Detach secondary's contact points before tombstoning so indexes
    // don't collide, then remove it from indexes via update-path.
    secondary.email = undefined;
    secondary.phone = undefined;
    secondary.status = AccountStatus.DELETED;
    secondary.mergedInto = primaryId;
    secondary.updatedAt = now;
    this._store.update(secondary);
    this._store.update(primary);

    return { primaryId, secondaryId, adoptedFields: adopted, sessionsReassigned };
  }

  // ------------------------------------------------------------------
  // Queries / admin
  // ------------------------------------------------------------------

  getUser(userId: string): PublicUser | undefined {
    const u = this._store.getById(userId);
    return u ? toPublicUser(u) : undefined;
  }

  getUserByLogin(login: string): PublicUser | undefined {
    const u = login.includes('@') ? this._store.getByEmail(login) : this._store.getByUsername(login);
    return u ? toPublicUser(u) : undefined;
  }

  /** Update profile fields on a user. */
  updateProfile(userId: string, patch: Partial<User['profile']>): PublicUser {
    const user = this._store.requireById(userId);
    const now = this._now();
    for (const field of ['displayName', 'givenName', 'familyName', 'locale', 'timezone'] as const) {
      if (patch[field] !== undefined) user.profile[field] = patch[field];
    }
    if (patch.attributes) {
      user.profile.attributes = { ...user.profile.attributes, ...patch.attributes };
    }
    user.updatedAt = now;
    return toPublicUser(user);
  }

  /** Housekeeping: sweep expired tokens and sessions. Returns counts. */
  sweep(): { tokensRemoved: number; sessionsRemoved: number } {
    const now = this._now();
    return { tokensRemoved: this._tokens.sweep(now), sessionsRemoved: this._sessions.sweep(now) };
  }

  /** Aggregate stats for health/metrics surfaces. */
  stats(): Record<string, number> {
    const users = this._store.all();
    const byStatus: Record<string, number> = {};
    for (const u of users) byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
    return {
      users: users.length,
      sessions: this._sessions.size(),
      tokens: this._tokens.size(),
      statusActive: byStatus[AccountStatus.ACTIVE] ?? 0,
      statusLocked: byStatus[AccountStatus.LOCKED] ?? 0,
      statusSuspended: byStatus[AccountStatus.SUSPENDED] ?? 0,
      statusDeleted: byStatus[AccountStatus.DELETED] ?? 0,
    };
  }
}

/**
 * Fixed dummy credential verified against on unknown-user login so the
 * timing profile approximates the real path. Computed once at module
 * load with default params.
 */
const DUMMY_CREDENTIAL: PasswordCredential = (() => {
  const h = new PasswordHasher();
  return h.hash('dummy-password-for-constant-time');
})();
