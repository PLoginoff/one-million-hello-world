/**
 * IdpRegistry — registry of trusted identity providers.
 */

import { IdentityProvider, IdpProtocol, SsoFederationError } from './types';

export class IdpRegistry {
  private providers = new Map<string, IdentityProvider>();
  private byEntityId = new Map<string, string>();

  register(idp: IdentityProvider): void {
    if (this.providers.has(idp.id)) {
      throw new SsoFederationError('invalid_request', `IdP already registered: ${idp.id}`);
    }
    if (this.byEntityId.has(idp.entityId)) {
      throw new SsoFederationError(
        'invalid_request',
        `IdP entityId already registered: ${idp.entityId}`
      );
    }
    this.providers.set(idp.id, idp);
    this.byEntityId.set(idp.entityId, idp.id);
  }

  get(id: string): IdentityProvider {
    const p = this.providers.get(id);
    if (!p) throw new SsoFederationError('unknown_idp', `Unknown IdP: ${id}`);
    if (!p.enabled) throw new SsoFederationError('unknown_idp', `IdP disabled: ${id}`);
    return p;
  }

  /** Resolve by SAML entityID / OIDC issuer URI. */
  getByEntityId(entityId: string): IdentityProvider | null {
    const id = this.byEntityId.get(entityId);
    return id ? this.providers.get(id) ?? null : null;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  list(filter?: { protocol?: IdpProtocol; enabledOnly?: boolean }): IdentityProvider[] {
    return Array.from(this.providers.values()).filter((p) => {
      if (filter?.protocol && p.protocol !== filter.protocol) return false;
      if (filter?.enabledOnly && !p.enabled) return false;
      return true;
    });
  }

  setEnabled(id: string, enabled: boolean): void {
    const p = this.providers.get(id);
    if (!p) throw new SsoFederationError('unknown_idp', `Unknown IdP: ${id}`);
    p.enabled = enabled;
  }

  remove(id: string): boolean {
    const p = this.providers.get(id);
    if (!p) return false;
    this.providers.delete(id);
    this.byEntityId.delete(p.entityId);
    return true;
  }

  get size(): number {
    return this.providers.size;
  }
}
