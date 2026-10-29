/**
 * NameIdMapper
 *
 * Produces NameID values in the negotiated format:
 *
 *  - PERSISTENT: HMAC-SHA256(localUserId, spEntityId, idpEntityId, salt)
 *    — stable per (user, SP) pair, unlinkable across SPs. The same triple
 *    always maps to the same opaque value, so the IdP can recognize a
 *    returning user without exposing the real user id.
 *  - TRANSIENT: random value per session — unlinkable even across
 *    sessions; nothing is persisted.
 *  - EMAIL: the user's email address.
 *  - UNSPECIFIED: the local user id.
 *
 * Persistent NameIDs are recorded in a bidirectional index so the IdP
 * can resolve an incoming NameID back to a local user (needed for SLO
 * and attribute queries).
 *
 * @module IdentityProvider/Federation
 */

import { createHmac, randomBytes } from 'crypto';
import { NameIdFormat, FederationError, FederationErrorCode } from './types';

export class NameIdMapper {
  /** HMAC key for persistent pseudonyms. Rotating it invalidates all. */
  private readonly _salt: string;
  /** (localUserId|spEntityId) -> persistent nameId. */
  private readonly _forward: Map<string, string> = new Map();
  /** nameId -> (localUserId|spEntityId). */
  private readonly _reverse: Map<string, string> = new Map();

  constructor(salt?: string) {
    this._salt = salt ?? randomBytes(32).toString('hex');
  }

  /**
   * Compute or look up the NameID for a user at an SP.
   *
   * `requested` is the SP's requested format; `supported` is the
   * intersection of IdP/SP metadata formats. Negotiation picks the
   * first mutually-supported format, preferring the SP's request.
   */
  issue(
    localUserId: string,
    spEntityId: string,
    idpEntityId: string,
    requested: NameIdFormat | undefined,
    supported: NameIdFormat[],
    userEmail?: string
  ): { nameId: string; format: NameIdFormat } {
    const format = this._negotiate(requested, supported);
    switch (format) {
      case NameIdFormat.PERSISTENT:
        return { nameId: this._persistent(localUserId, spEntityId, idpEntityId), format };
      case NameIdFormat.TRANSIENT:
        return { nameId: `t-${randomBytes(16).toString('base64url')}`, format };
      case NameIdFormat.EMAIL:
        if (!userEmail) {
          throw new FederationError(FederationErrorCode.UNSUPPORTED_NAMEID, 'user has no email for email-format NameID');
        }
        return { nameId: userEmail, format };
      case NameIdFormat.UNSPECIFIED:
      default:
        return { nameId: localUserId, format };
    }
  }

  /**
   * Resolve a previously-issued PERSISTENT NameID back to a local user.
   * Returns undefined for non-persistent/unknown ids.
   */
  resolve(nameId: string): { userId: string; spEntityId: string } | undefined {
    const key = this._reverse.get(nameId);
    if (!key) return undefined;
    const sep = key.indexOf('|');
    if (sep < 0) return undefined;
    return { userId: key.slice(0, sep), spEntityId: key.slice(sep + 1) };
  }

  /**
   * Negotiate the NameID format: prefer the SP's request if mutually
   * supported; else the first format in `supported`.
   */
  private _negotiate(requested: NameIdFormat | undefined, supported: NameIdFormat[]): NameIdFormat {
    if (supported.length === 0) return NameIdFormat.UNSPECIFIED;
    if (requested !== undefined && supported.includes(requested)) return requested;
    return supported[0];
  }

  private _persistent(localUserId: string, spEntityId: string, idpEntityId: string): string {
    const key = `${localUserId}|${spEntityId}`;
    const existing = this._forward.get(key);
    if (existing) return existing;
    const nameId = createHmac('sha256', this._salt)
      .update(`${localUserId}|${spEntityId}|${idpEntityId}`)
      .digest('base64url');
    this._forward.set(key, nameId);
    this._reverse.set(nameId, key);
    return nameId;
  }

  /** Diagnostics. */
  size(): number {
    return this._forward.size;
  }
}
