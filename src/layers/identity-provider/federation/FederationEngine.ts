/**
 * FederationEngine
 *
 * Orchestrates the federation primitives:
 *
 *   MetadataStore            — entity metadata registry
 *   KeyResolver              — JWKS-like keys, rollover, sign/verify
 *   AttributeReleaseEngine   — per-SP attribute filtering
 *   NameIdMapper             — persistent/transient NameID issuance
 *   SamlAdapter / OidcAdapter — protocol message builders/parsers
 *
 * Engine-level responsibilities:
 *  - Trust-relationship management (establish/revoke, metadata binding)
 *  - SSO: accept a SAML AuthnRequest, run local authn (via a pluggable
 *    authenticator), produce a signed Response with policy-filtered
 *    attributes and negotiated NameID
 *  - JIT provisioning: on first federation, create a local user record
 *    keyed by persistent subject; return existing on subsequent logins
 *  - Session tracking: one FederationSession per (subject, IdP session)
 *    shared by participating SPs
 *  - SLO propagation: broadcast logout to all session participants and
 *    collect per-participant outcomes
 *
 * @module IdentityProvider/Federation
 */

import { randomBytes } from 'crypto';
import {
  EntityMetadata,
  TrustRelationship,
  SamlAuthnRequest,
  SamlResponse,
  SamlLogoutMessage,
  NameIdFormat,
  FederatedIdentity,
  FederationSession,
  SloResult,
  ProvisionedUser,
  AttributeReleasePolicy,
  FederationEngineConfig,
  DEFAULT_FEDERATION_CONFIG,
  FederationError,
  FederationErrorCode,
} from './types';
import { MetadataStore } from './MetadataStore';
import { KeyResolver } from './KeyResolver';
import { AttributeReleaseEngine } from './AttributeReleaseEngine';
import { NameIdMapper } from './NameIdMapper';
import { SamlAdapter } from './SamlAdapter';
import { OidcAdapter } from './OidcAdapter';

/** Local user record the engine authenticates against. */
export interface LocalAccount {
  userId: string;
  email?: string;
  /** Full attribute set available for release. */
  attributes: Record<string, string[]>;
}

/**
 * Pluggable authenticator: given a local user id, return the account or
 * undefined. In tests this is a Map; in production it would call the
 * identity layer.
 */
export type AccountResolver = (userId: string) => LocalAccount | undefined;

export class FederationEngine {
  readonly metadata: MetadataStore;
  readonly keys: KeyResolver;
  readonly attributes: AttributeReleaseEngine;
  readonly nameIds: NameIdMapper;
  readonly saml: SamlAdapter;
  readonly oidc: OidcAdapter;

  private readonly _config: FederationEngineConfig;
  private readonly _trusts: Map<string, TrustRelationship> = new Map();
  private readonly _sessions: Map<string, FederationSession> = new Map();
  private readonly _users: Map<string, LocalAccount> = new Map();
  /** (idpEntityId|subjectKey) -> provisioned user id. */
  private readonly _jitIndex: Map<string, string> = new Map();
  private readonly _jitUsers: Map<string, ProvisionedUser> = new Map();
  private readonly _resolveAccount: AccountResolver;
  private readonly _now: () => number;

  constructor(
    config?: Partial<FederationEngineConfig>,
    resolveAccount?: AccountResolver,
    now: () => number = Date.now
  ) {
    this._config = { ...DEFAULT_FEDERATION_CONFIG, ...config };
    this._now = now;
    this.metadata = new MetadataStore();
    this.keys = new KeyResolver();
    this.attributes = new AttributeReleaseEngine();
    this.nameIds = new NameIdMapper();
    this.saml = new SamlAdapter(this.keys, this._config.clockSkewMs);
    this.oidc = new OidcAdapter(this.keys, this._config.idpEntityId, this._config.authCodeTtlMs);
    this._resolveAccount = resolveAccount ?? ((id) => this._users.get(id));
  }

  // ------------------------------------------------------------------
  // Local accounts
  // ------------------------------------------------------------------

  /** Register a local account that can federate outward. */
  registerAccount(account: LocalAccount): void {
    this._users.set(account.userId, account);
  }

  // ------------------------------------------------------------------
  // Metadata & trust
  // ------------------------------------------------------------------

  /**
   * Publish this IdP's own metadata document. Should be called at boot
   * so partners can consume endpoints/keys.
   */
  publishSelfMetadata(doc: Omit<EntityMetadata, 'entityId' | 'role'>): EntityMetadata {
    const meta: EntityMetadata = { ...doc, entityId: this._config.idpEntityId, role: 'idp' };
    this.metadata.publish(meta);
    this.keys.publishKeys(meta.entityId, meta.signingKeys);
    return meta;
  }

  /**
   * Establish trust with a partner entity (SP or peer IdP). Publishes
   * the partner's metadata + keys, binds an attribute policy.
   */
  establishTrust(input: {
    metadata: EntityMetadata;
    attributePolicy?: AttributeReleasePolicy;
    jitProvisioning?: boolean;
    sloPropagation?: boolean;
    allowedAlgorithms?: string[];
  }): TrustRelationship {
    const now = this._now();
    this.metadata.publish(input.metadata);
    this.keys.publishKeys(input.metadata.entityId, input.metadata.signingKeys);
    if (input.attributePolicy) {
      this.attributes.registerPolicy(input.attributePolicy);
    }
    const trust: TrustRelationship = {
      id: `trust_${randomBytes(8).toString('base64url')}`,
      entityId: input.metadata.entityId,
      metadata: input.metadata,
      attributePolicyId: input.attributePolicy?.id,
      jitProvisioning: input.jitProvisioning ?? true,
      sloPropagation: input.sloPropagation ?? true,
      establishedAt: now,
      allowedAlgorithms: input.allowedAlgorithms,
    };
    this._trusts.set(input.metadata.entityId, trust);
    return trust;
  }

  /** Revoke trust: drop metadata, keys, and any bound policy. */
  revokeTrust(entityId: string): boolean {
    const t = this._trusts.get(entityId);
    if (!t) return false;
    this._trusts.delete(entityId);
    if (t.attributePolicyId) this.attributes.removePolicy(t.attributePolicyId);
    this.keys.publishKeys(entityId, []);
    return true;
  }

  /** Refresh partner metadata (e.g. after key rollover upstream). */
  refreshPartnerMetadata(entityId: string, metadata: EntityMetadata): void {
    const t = this._requireTrust(entityId);
    t.metadata = metadata;
    this.metadata.publish(metadata);
    this.keys.publishKeys(entityId, metadata.signingKeys);
  }

  private _requireTrust(entityId: string): TrustRelationship {
    const t = this._trusts.get(entityId);
    if (!t) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `no trust relationship for ${entityId}`);
    }
    return t;
  }

  trustFor(entityId: string): TrustRelationship | undefined {
    return this._trusts.get(entityId);
  }

  // ------------------------------------------------------------------
  // SSO (IdP role): AuthnRequest -> signed Response
  // ------------------------------------------------------------------

  /**
   * Handle an SP-initiated SAML AuthnRequest: authenticate `localUserId`
   * (already authenticated upstream — this engine performs issuance),
   * negotiate NameID, filter attributes via the SP's bound policy, sign
   * the assertion, and register a federation session for SLO.
   */
  handleAuthnRequest(request: SamlAuthnRequest, localUserId: string): SamlResponse {
    const trust = this._requireTrust(request.issuer);
    const account = this._resolveAccount(localUserId);
    if (!account) {
      throw new FederationError(FederationErrorCode.UNKNOWN_ENTITY, `unknown local user ${localUserId}`);
    }
    const sp = trust.metadata;
    const supported = sp.nameIdFormats.length > 0 ? sp.nameIdFormats : [NameIdFormat.UNSPECIFIED];
    const { nameId, format } = this.nameIds.issue(
      localUserId,
      sp.entityId,
      this._config.idpEntityId,
      request.nameIdPolicyFormat,
      supported,
      account.email
    );
    const released = this.attributes.release(trust.attributePolicyId, account.attributes);
    const now = this._now();
    const sessionIndex = `sess_${randomBytes(12).toString('base64url')}`;

    const response = this.saml.buildResponse({
      issuer: this._config.idpEntityId,
      inResponseTo: request.id,
      destination: request.assertionConsumerServiceUrl,
      audience: sp.entityId,
      subject: { nameId, nameIdFormat: format },
      attributes: released,
      ttlMs: this._config.assertionTtlMs,
      sessionIndex,
      relayState: request.relayState,
      alg: this._config.signatureAlgorithm,
      now,
    });

    // Record session participation for SLO
    const subjectKey = format === NameIdFormat.PERSISTENT ? nameId : localUserId;
    let session = this._sessions.get(sessionIndex);
    if (!session) {
      session = {
        sessionIndex,
        subjectKey,
        idpEntityId: this._config.idpEntityId,
        participantEntityIds: new Set(),
        createdAt: now,
      };
      this._sessions.set(sessionIndex, session);
    }
    session.participantEntityIds.add(sp.entityId);

    return response;
  }

  /**
   * SP-role: consume a signed Response into a FederatedIdentity.
   * Optionally JIT-provisions a local user record.
   */
  consumeResponse(
    response: SamlResponse,
    expectedInResponseTo?: string,
    expectedAudience?: string
  ): { identity: FederatedIdentity; provisioned?: ProvisionedUser } {
    const now = this._now();
    const assertion = this.saml.parseResponse(response, expectedInResponseTo, expectedAudience, now);
    const identity: FederatedIdentity = {
      idpEntityId: response.issuer,
      nameId: assertion.subject.nameId,
      nameIdFormat: assertion.subject.nameIdFormat,
      attributes: assertion.attributes,
      sessionIndex: assertion.sessionIndex ?? assertion.id,
      authenticatedAt: assertion.conditions.notBefore,
      expiresAt: assertion.conditions.notOnOrAfter,
    };
    let provisioned: ProvisionedUser | undefined;
    const trust = this._trusts.get(response.issuer);
    if (trust?.jitProvisioning) {
      provisioned = this._jitProvision(response.issuer, assertion.subject.nameId, assertion.attributes, now);
    }
    return { identity, provisioned };
  }

  /** JIT: create or return the local shadow user for a federated subject. */
  private _jitProvision(
    idpEntityId: string,
    subjectKey: string,
    attributes: Record<string, string[]>,
    now: number
  ): ProvisionedUser {
    const key = `${idpEntityId}|${subjectKey}`;
    const existing = this._jitIndex.get(key);
    if (existing !== undefined) {
      const rec = this._jitUsers.get(existing);
      if (rec) return { ...rec, justCreated: false };
    }
    const user: ProvisionedUser = {
      id: `jit_${randomBytes(10).toString('base64url')}`,
      idpEntityId,
      subjectKey,
      attributes: { ...attributes },
      createdAt: now,
      justCreated: true,
    };
    this._jitUsers.set(user.id, user);
    this._jitIndex.set(key, user.id);
    return user;
  }

  // ------------------------------------------------------------------
  // Single Logout
  // ------------------------------------------------------------------

  /**
   * Initiate SLO for a session: broadcast a logout request to every
   * participant (except the initiator when specified) and collect
   * outcomes. `send` is the transport hook — tests can deliver the
   * message to a peer engine synchronously.
   */
  initiateSlo(
    sessionIndex: string,
    nameId: string,
    send: (entityId: string, msg: SamlLogoutMessage) => boolean,
    initiatorEntityId?: string
  ): SloResult {
    const session = this._sessions.get(sessionIndex);
    if (!session) {
      throw new FederationError(FederationErrorCode.UNKNOWN_SESSION, `unknown session ${sessionIndex}`);
    }
    const result: SloResult = { sessionIndex, propagated: [] };
    for (const entityId of session.participantEntityIds) {
      if (entityId === initiatorEntityId) continue;
      const trust = this._trusts.get(entityId);
      if (!trust?.sloPropagation) {
        result.propagated.push({ entityId, ok: false, error: 'slo_propagation_disabled' });
        continue;
      }
      const slo = trust.metadata.sloEndpoints[0];
      if (!slo) {
        result.propagated.push({ entityId, ok: false, error: 'no_slo_endpoint' });
        continue;
      }
      const msg = this.saml.buildLogoutMessage({
        issuer: this._config.idpEntityId,
        destination: slo.location,
        nameId,
        sessionIndex,
        now: this._now(),
      });
      try {
        const ok = send(entityId, msg);
        result.propagated.push({ entityId, ok });
      } catch (e) {
        result.propagated.push({ entityId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    this._sessions.delete(sessionIndex);
    return result;
  }

  /**
   * Receive a SLO request from a partner: remove matching local sessions
   * for the subject and answer Success.
   */
  handleLogoutRequest(msg: SamlLogoutMessage): SamlLogoutMessage {
    const trust = this._requireTrust(msg.issuer);
    void trust;
    let cleared = 0;
    for (const [idx, session] of this._sessions) {
      const match =
        msg.sessionIndex !== undefined
          ? idx === msg.sessionIndex
          : session.subjectKey === msg.nameId;
      if (match) {
        this._sessions.delete(idx);
        cleared++;
      }
    }
    const dest = this.metadata.require(this._config.idpEntityId).sloEndpoints[0]?.location ?? '';
    return this.saml.buildLogoutMessage({
      issuer: this._config.idpEntityId,
      destination: dest,
      inResponseTo: msg.id,
      status: cleared > 0 || msg.sessionIndex === undefined ? 'Success' : 'PartialLogout',
      now: this._now(),
    });
  }

  /** Session lookup (diagnostics). */
  session(sessionIndex: string): FederationSession | undefined {
    return this._sessions.get(sessionIndex);
  }

  sessionCount(): number {
    return this._sessions.size;
  }

  /** Provisioned user lookup. */
  provisionedUser(id: string): ProvisionedUser | undefined {
    return this._jitUsers.get(id);
  }

  stats(): Record<string, number> {
    return {
      trusts: this._trusts.size,
      sessions: this._sessions.size,
      localAccounts: this._users.size,
      jitUsers: this._jitUsers.size,
      metadataDocs: this.metadata.size(),
    };
  }
}
