/**
 * PasswordPolicyEngine
 *
 * Evaluates candidate passwords against a configurable policy:
 *
 *  - Length bounds (min/max, counted in Unicode code points).
 *  - Character-class requirements (upper, lower, digit, symbol).
 *  - User-info containment (username, email local part, display name
 *    tokens must not appear in the password — checked case-insensitively
 *    and on leetspeak-normalized forms).
 *  - History: the candidate must differ from the last N credentials
 *    (verified via the hasher, so reuse of an old password is caught even
 *    though salts differ).
 *  - Breach list: a pluggable synchronous membership check
 *    (Bloom-filter / k-anonymity stub) that rejects passwords known to
 *    be compromised.
 *  - A rough 0-4 strength score combining length, class diversity, and
 *    entropy-per-char estimate.
 *
 * All checks are pure and synchronous except none — everything runs
 * in-memory. History verification costs one scrypt per history entry
 * (~tens of ms each at default params).
 *
 * @module Identity/Core
 */

import {
  PasswordPolicy,
  PasswordCheckResult,
  PolicyViolation,
  PasswordCredential,
  User,
} from './types';
import { PasswordHasher } from './PasswordHasher';

/**
 * Synchronous breach-list membership probe.
 * Return true if the password is known-compromised.
 */
export type BreachProbe = (password: string) => boolean;

/** A tiny built-in breach corpus for tests/dev — top common passwords. */
export const DEFAULT_BREACH_LIST: ReadonlySet<string> = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'qwerty123', 'letmein', 'iloveyou', 'dragon', 'monkey',
  'football', 'baseball', 'welcome', 'admin', 'admin123', 'abc123',
  'p@ssw0rd', 'passw0rd', 'hunter2', 'trustno1', 'sunshine', 'master',
]);

const SYMBOL_RE = /[^A-Za-z0-9]/u;

/** Normalize leetspeak/1337 substitutions to catch trivial obfuscation. */
function deleet(s: string): string {
  return s
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i');
}

/** Extract the tokens that must not appear in a user's password. */
function userInfoTokens(user?: Pick<User, 'username' | 'email' | 'profile'>): string[] {
  if (!user) return [];
  const tokens: string[] = [];
  tokens.push(user.username);
  if (user.email) {
    const local = user.email.split('@')[0];
    if (local) tokens.push(local);
  }
  const dn = user.profile?.displayName;
  if (dn) {
    for (const part of dn.split(/[\s._-]+/)) {
      if (part.length >= 3) tokens.push(part);
    }
  }
  return tokens.filter((t) => t.length >= 3).map((t) => t.toLowerCase());
}

export class PasswordPolicyEngine {
  private readonly _hasher: PasswordHasher;
  private readonly _breach: BreachProbe;

  constructor(hasher: PasswordHasher, breachProbe?: BreachProbe) {
    this._hasher = hasher;
    this._breach = breachProbe ?? ((pw: string) => DEFAULT_BREACH_LIST.has(pw.toLowerCase()) || DEFAULT_BREACH_LIST.has(deleet(pw)));
  }

  /**
   * Evaluate a candidate password. `user` supplies context for
   * user-info checks; `history` supplies previous credentials for
   * reuse detection (most recent first is not required — all are checked,
   * up to policy.historySize).
   */
  check(
    candidate: string,
    policy: PasswordPolicy,
    user?: Pick<User, 'username' | 'email' | 'profile'>,
    history: PasswordCredential[] = []
  ): PasswordCheckResult {
    const violations: PolicyViolation[] = [];
    const len = [...candidate].length; // code points, not UTF-16 units

    if (len < policy.minLength) {
      violations.push({ rule: 'min_length', message: `password must be at least ${policy.minLength} characters (got ${len})` });
    }
    if (len > policy.maxLength) {
      violations.push({ rule: 'max_length', message: `password must be at most ${policy.maxLength} characters` });
    }

    if (policy.requireLower && !/[a-z]/.test(candidate)) {
      violations.push({ rule: 'require_lower', message: 'password must contain a lowercase letter' });
    }
    if (policy.requireUpper && !/[A-Z]/.test(candidate)) {
      violations.push({ rule: 'require_upper', message: 'password must contain an uppercase letter' });
    }
    if (policy.requireDigit && !/[0-9]/.test(candidate)) {
      violations.push({ rule: 'require_digit', message: 'password must contain a digit' });
    }
    if (policy.requireSymbol && !SYMBOL_RE.test(candidate)) {
      violations.push({ rule: 'require_symbol', message: 'password must contain a symbol' });
    }

    // Repeated-character / trivial-sequence heuristics
    if (/(.)\1{3,}/u.test(candidate)) {
      violations.push({ rule: 'repeated_chars', message: 'password contains a character repeated 4+ times' });
    }

    if (policy.forbidUserInfo) {
      const lower = candidate.toLowerCase();
      const deleeter = deleet(candidate);
      for (const tok of userInfoTokens(user)) {
        if (lower.includes(tok) || deleeter.includes(deleet(tok))) {
          violations.push({ rule: 'user_info', message: 'password must not contain personal information' });
          break;
        }
      }
    }

    // History — verify against each stored credential (constant-time inside hasher)
    if (policy.historySize > 0 && history.length > 0) {
      const recent = history.slice(-policy.historySize);
      for (const cred of recent) {
        if (this._hasher.verify(candidate, cred)) {
          violations.push({ rule: 'history', message: `password was used recently; must differ from last ${policy.historySize} passwords` });
          break;
        }
      }
    }

    if (policy.breachCheck && this._breach(candidate)) {
      violations.push({ rule: 'breach', message: 'password appears in a known breach corpus' });
    }

    return { ok: violations.length === 0, violations, score: this._score(candidate, violations) };
  }

  /**
   * Rough strength score 0-4:
   *  - 0/1 if policy violations exist or length < 8
   *  - +1 length >= 12, +1 length >= 16
   *  - +1 if >= 3 character classes present
   *  - +1 entropy-per-char estimate over threshold
   */
  private _score(candidate: string, violations: PolicyViolation[]): number {
    const len = [...candidate].length;
    if (violations.some((v) => v.rule === 'breach' || v.rule === 'history')) return 0;
    if (len < 8) return violations.length === 0 ? 1 : 0;

    let score = 1;
    if (len >= 12) score++;
    if (len >= 16) score++;
    let classes = 0;
    if (/[a-z]/.test(candidate)) classes++;
    if (/[A-Z]/.test(candidate)) classes++;
    if (/[0-9]/.test(candidate)) classes++;
    if (SYMBOL_RE.test(candidate)) classes++;
    if (classes >= 3) score++;

    // Unique-char ratio as a cheap entropy proxy
    const unique = new Set([...candidate]).size;
    if (unique / Math.max(1, len) > 0.6 && len >= 12 && score < 4) score++;

    return Math.min(4, Math.max(0, score));
  }
}
