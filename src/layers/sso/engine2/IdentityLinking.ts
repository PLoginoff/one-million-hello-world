/**
 * Identity Linking — merge identities across providers.
 *
 * One human ("principal") may authenticate through several IdPs
 * (google-oauth2, adfs, github). This module maintains the link graph:
 *
 *   - `link(principal, idpIdentity)` — attach a provider identity to a
 *     principal. An identity belongs to exactly one principal; linking
 *     an identity that's already linked elsewhere *moves* it
 *     (auto-merge), recording the merge for audit.
 *   - `unlink` — detach an identity; it becomes a free-standing record.
 *   - `resolve(idpId, subject)` → principal for a provider login.
 *   - `merge(primary, secondary)` — move all identities + attributes
 *     from secondary into primary and tombstone the secondary.
 *   - Conflict detection: when two linked identities carry the same
 *     attribute with different values, a `LinkConflict` is emitted so
 *     the caller can pick the winner (we keep principal-scoped
 *     attributes authoritative by default).
 *
 * The store is an adjacency map — union-find isn't needed since moves
 * are whole-principal operations, O(#identities on moved principal).
 *
 * @module Sso/Engine2
 */

/** A provider identity (IdP-local subject claim). */
export interface IdpIdentity {
  /** e.g. 'google-oauth2', 'saml-adfs'. */
  readonly idpId: string;
  /** The subject/username at that IdP. */
  readonly subject: string;
  /** Attributes asserted by that IdP (email, name, ...). */
  readonly attributes: Readonly<Record<string, string>>;
  readonly linkedAt: number;
}

/** A merged user identity. */
export interface Principal {
  readonly id: string;
  /** Principal-scoped attributes (authoritative). */
  readonly attributes: Record<string, string>;
  /** Tombstone: set when merged into another principal. */
  mergedInto?: string;
  readonly createdAt: number;
}

/** Attribute disagreement discovered during a link/merge. */
export interface LinkConflict {
  readonly principalId: string;
  readonly attribute: string;
  readonly principalValue: string;
  readonly incomingValue: string;
  /** Which IdP supplied the incoming value. */
  readonly sourceIdp: string;
}

export interface LinkResult {
  readonly principalId: string;
  /** Principal the identity was moved *from*, if it was re-linked. */
  readonly movedFrom?: string;
  readonly conflicts: readonly LinkConflict[];
}

export class IdentityLinker {
  private readonly principals = new Map<string, Principal>();
  /** idpId:subject → principalId */
  private readonly bindings = new Map<string, string>();
  /** idpId:subject → identity record */
  private readonly identities = new Map<string, IdpIdentity>();
  private seq = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  /** Create a new principal. */
  createPrincipal(attributes: Record<string, string> = {}): Principal {
    const p: Principal = {
      id: `p-${++this.seq}`,
      attributes: { ...attributes },
      createdAt: this.clock(),
    };
    this.principals.set(p.id, p);
    return p;
  }

  principal(id: string): Principal | undefined {
    return this.principals.get(id);
  }

  private static key(idpId: string, subject: string): string {
    return idpId + ':' + subject;
  }

  /** Attach an IdP identity to a principal. */
  link(
    principalId: string,
    identity: Omit<IdpIdentity, 'linkedAt'>
  ): LinkResult {
    const p = this.principals.get(principalId);
    if (!p || p.mergedInto) throw new LinkError(`unknown or merged principal ${principalId}`);
    const key = IdentityLinker.key(identity.idpId, identity.subject);
    const existing = this.bindings.get(key);
    const movedFrom = existing !== principalId ? existing : undefined;

    this.bindings.set(key, principalId);
    this.identities.set(key, { ...identity, linkedAt: this.clock() });

    // Surface attribute conflicts (incoming vs principal attributes).
    const conflicts: LinkConflict[] = [];
    for (const [k, v] of Object.entries(identity.attributes)) {
      const pv = p.attributes[k];
      if (pv !== undefined && pv !== v) {
        conflicts.push({
          principalId,
          attribute: k,
          principalValue: pv,
          incomingValue: v,
          sourceIdp: identity.idpId,
        });
      } else if (pv === undefined) {
        p.attributes[k] = v; // fill gaps; principal attributes win on conflict
      }
    }
    return { principalId, movedFrom, conflicts };
  }

  /** Detach an identity; returns the principal it was on. */
  unlink(idpId: string, subject: string): string | null {
    const key = IdentityLinker.key(idpId, subject);
    const pid = this.bindings.get(key);
    if (pid === undefined) return null;
    this.bindings.delete(key);
    this.identities.delete(key);
    return pid;
  }

  /** Resolve a provider login to a principal. */
  resolve(idpId: string, subject: string): Principal | undefined {
    const pid = this.bindings.get(IdentityLinker.key(idpId, subject));
    return pid !== undefined ? this.principals.get(pid) : undefined;
  }

  /** All identities linked to a principal. */
  identitiesFor(principalId: string): readonly IdpIdentity[] {
    const out: IdpIdentity[] = [];
    for (const [key, pid] of this.bindings) {
      if (pid === principalId) {
        const id = this.identities.get(key);
        if (id) out.push(id);
      }
    }
    return out;
  }

  /**
   * Merge secondary into primary: re-link all identities, fill missing
   * attributes (primary wins on conflict), tombstone secondary.
   */
  merge(primaryId: string, secondaryId: string): LinkResult {
    const primary = this.principals.get(primaryId);
    const secondary = this.principals.get(secondaryId);
    if (!primary || primary.mergedInto) throw new LinkError(`primary ${primaryId} invalid`);
    if (!secondary || secondary.mergedInto) throw new LinkError(`secondary ${secondaryId} invalid`);
    if (primaryId === secondaryId) throw new LinkError('cannot merge principal into itself');

    const conflicts: LinkConflict[] = [];
    for (const [k, v] of Object.entries(secondary.attributes)) {
      const pv = primary.attributes[k];
      if (pv !== undefined && pv !== v) {
        conflicts.push({
          principalId: primaryId,
          attribute: k,
          principalValue: pv,
          incomingValue: v,
          sourceIdp: 'principal:' + secondaryId,
        });
      } else if (pv === undefined) {
        primary.attributes[k] = v;
      }
    }
    for (const [key, pid] of this.bindings) {
      if (pid === secondaryId) this.bindings.set(key, primaryId);
    }
    secondary.mergedInto = primaryId;
    return { principalId: primaryId, movedFrom: secondaryId, conflicts };
  }

  /** Follow merge tombstones to the live principal. */
  resolvePrincipal(id: string): Principal | undefined {
    let p = this.principals.get(id);
    let hops = 0;
    while (p?.mergedInto && hops++ < 64) {
      p = this.principals.get(p.mergedInto);
    }
    return p && !p.mergedInto ? p : undefined;
  }
}

export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkError';
  }
}
