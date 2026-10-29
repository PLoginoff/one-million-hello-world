/**
 * Federation — real IdP federation engine.
 */

export {
  NameIdFormat,
  FederationErrorCode,
  FederationError,
  DEFAULT_FEDERATION_CONFIG,
} from './types';
export type {
  FederationEndpoint,
  JwkStub,
  EntityMetadata,
  TrustRelationship,
  OidcAuthorizationRequest,
  OidcTokenResponse,
  OidcIdTokenClaims,
  SamlAuthnRequest,
  SamlAssertion,
  SamlResponse,
  SamlLogoutMessage,
  AttributeRule,
  AttributeReleasePolicy,
  FederatedIdentity,
  FederationSession,
  SloResult,
  ProvisionedUser,
  FederationEngineConfig,
} from './types';

export { KeyResolver, canonicalize } from './KeyResolver';
export { MetadataStore } from './MetadataStore';
export { AttributeReleaseEngine } from './AttributeReleaseEngine';
export { NameIdMapper } from './NameIdMapper';
export { OidcAdapter } from './OidcAdapter';
export { SamlAdapter } from './SamlAdapter';
export { FederationEngine } from './FederationEngine';
export type { LocalAccount, AccountResolver } from './FederationEngine';
export { ConsentStore } from './ConsentStore';
export type { ConsentRecord, ConsentFilterResult } from './ConsentStore';
export { RelyingPartyRegistry } from './RelyingPartyRegistry';
export type { RelyingParty } from './RelyingPartyRegistry';
export { MetadataRefresher } from './MetadataRefresh';
export type { RefreshState, RefresherConfig } from './MetadataRefresh';
