/**
 * IdentityStore
 *
 * In-memory user repository with three unique secondary indexes:
 *
 *   username (lowercased) -> userId
 *   email    (lowercased) -> userId
 *   phone                 -> userId
 *
 * Uniqueness is enforced at write time; index entries are swapped
 * atomically with the record update so lookups never observe a
 * half-updated index.
 *
 * All access is O(1); `findMergeCandidates` additionally scans the
 * phone index for normalized variants (last-N-digit suffix match).
 *
 * @module Identity/Core
 */

import { User, IdentityCoreError, IdentityErrorCode } from './types';

/** Normalize an email for indexing: lowercase, strip plus-tags on gmail-style domains. */
export function normalizeEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  // gmail/fastmail-style: ignore +tag and dots in local part
  if (domain === 'gmail.com' || domain === 'googlemail.com' || domain === 'fastmail.com') {
    return local.split('+')[0].replace(/\./g, '') + '@' + domain;
  }
  return local.split('+')[0] + '@' + domain;
}

/** Normalize a phone number for indexing: digits only, keep leading +. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export class IdentityStore {
  private readonly _byId: Map<string, User> = new Map();
  private readonly _byUsername: Map<string, string> = new Map();
  private readonly _byEmail: Map<string, string> = new Map();
  private readonly _byPhone: Map<string, string> = new Map();

  /** Insert a new user. Throws USERNAME_TAKEN / EMAIL_TAKEN on conflicts. */
  insert(user: User): void {
    const uname = user.username.toLowerCase();
    const nameOwner = this._byUsername.get(uname);
    if (nameOwner !== undefined && nameOwner !== user.id) {
      throw new IdentityCoreError(IdentityErrorCode.USERNAME_TAKEN, `username taken: ${user.username}`);
    }
    if (user.email !== undefined) {
      const owner = this._byEmail.get(normalizeEmail(user.email));
      if (owner !== undefined && owner !== user.id) {
        throw new IdentityCoreError(IdentityErrorCode.EMAIL_TAKEN, `email taken: ${user.email}`);
      }
    }
    if (user.phone !== undefined) {
      const owner = this._byPhone.get(normalizePhone(user.phone));
      if (owner !== undefined && owner !== user.id) {
        throw new IdentityCoreError(IdentityErrorCode.EMAIL_TAKEN, `phone taken: ${user.phone}`);
      }
    }
    this._byId.set(user.id, user);
    this._byUsername.set(uname, user.id);
    if (user.email !== undefined) this._byEmail.set(normalizeEmail(user.email), user.id);
    if (user.phone !== undefined) this._byPhone.set(normalizePhone(user.phone), user.id);
  }

  /** Update an existing user; re-indexes email/phone/username if changed. */
  update(user: User): void {
    const existing = this._byId.get(user.id);
    if (!existing) {
      throw new IdentityCoreError(IdentityErrorCode.USER_NOT_FOUND, `user not found: ${user.id}`);
    }
    // Drop stale index entries
    this._byUsername.delete(existing.username.toLowerCase());
    if (existing.email !== undefined) this._byEmail.delete(normalizeEmail(existing.email));
    if (existing.phone !== undefined) this._byPhone.delete(normalizePhone(existing.phone));
    // Insert enforces uniqueness against other owners
    this._byId.delete(user.id);
    try {
      this.insert(user);
    } catch (e) {
      // Roll back to the previous record so a failed update never drops the user
      this.insert(existing);
      throw e;
    }
  }

  getById(id: string): User | undefined {
    return this._byId.get(id);
  }

  requireById(id: string): User {
    const u = this._byId.get(id);
    if (!u) {
      throw new IdentityCoreError(IdentityErrorCode.USER_NOT_FOUND, `user not found: ${id}`);
    }
    return u;
  }

  getByUsername(username: string): User | undefined {
    const id = this._byUsername.get(username.toLowerCase());
    return id !== undefined ? this._byId.get(id) : undefined;
  }

  getByEmail(email: string): User | undefined {
    const id = this._byEmail.get(normalizeEmail(email));
    return id !== undefined ? this._byId.get(id) : undefined;
  }

  getByPhone(phone: string): User | undefined {
    const id = this._byPhone.get(normalizePhone(phone));
    return id !== undefined ? this._byId.get(id) : undefined;
  }

  /**
   * Remove a record and its indexes (hard delete — used only by merge
   * internals; normal deletion is a status transition).
   */
  remove(id: string): boolean {
    const u = this._byId.get(id);
    if (!u) return false;
    this._byId.delete(id);
    this._byUsername.delete(u.username.toLowerCase());
    if (u.email !== undefined) this._byEmail.delete(normalizeEmail(u.email));
    if (u.phone !== undefined) this._byPhone.delete(normalizePhone(u.phone));
    return true;
  }

  /** All users (snapshot). O(n). */
  all(): User[] {
    return [...this._byId.values()];
  }

  size(): number {
    return this._byId.size;
  }
}
