/**
 * Federation Types
 *
 * Shared types for the IdP federation engine: protocol messages,
 * metadata documents, trust relationships, JWKS-like key stores,
 * name-ID formats, attribute release policies, JIT provisioning,
 * and single-logout propagation.
 *
 * Protocol models are deliberately simplified ("OIDC-ish", "SAML-ish"):
 * they preserve the structural semantics — authorization-code flows,
 * signed assertions, metadata exchange, SLO — without byte-level
 * wire fidelity.
 *
 * @module IdentityProvider/Federation
 */

// -------------------------------------------------------------------
// Metadata
// -------------------------------------------------------------------

/** A published endpoint in entity metadata. */
export interface FederationEndpoint {
  /** Binding hint, e.g. 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'. */
  binding: string;
  location: string;
  /** Optional response location for POST bindings. */
  responseLocation?: string;
}

/** A public key stub — JWKS-shaped. */
export interface JwkStub {
  kty: 'RSA' | 'EC' | 'oct';
  kid: string;
  alg?: string;
  use?: 'sig' | 'enc';
  /** Modulus (RSA) / x-coord (EC) / key material (oct), base64url. */
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  k?: string;
  /** Epoch ms after which the key must not be used for new signatures. */
  expiresAt?: number;
  /** True if administratively retired (verify-only). */
  retired?: boolean;
}

/** Entity metadata document (IdP or SP). */
export interface EntityMetadata {
  entityId: string;
  /** 'idp' publishes SSO/SLO services; 'sp' publishes ACS/SLO consumers. */
  role: 'idp' | 'sp';
  /** Human-readable display name. */
  displayName?: string;
  /** SSO/ACS endpoints in preference order. */
  ssoEndpoints: FederationEndpoint[];
  sloEndpoints: FederationEndpoint[];
  /** Signing keys (JWKS-like). */
  signingKeys: JwkStub[];
  /** Name-ID formats the entity supports, in preference order. */
  nameIdFormats: NameIdFormat[];
  /** Attribute names the entity understands (IdP: can release; SP: wants). */
  attributes: string[];
  /** Certificate chain stubs (PEM-ish placeholders). */
  certificates: string[];
  /** Document issue/expiry for cache validity. */
  validUntil?: number;
}

// -------------------------------------------------------------------
// Trust & keys
// -------------------------------------------------------------------

/** A configured trust relationship between this IdP and a partner. */
export interface TrustRelationship {
  /** Local identifier for the relationship. */
  id: string;
  /** Partner entityId. */
  entityId: string;
  /** Metadata (possibly refreshed periodically). */
  metadata: EntityMetadata;
  /** Attribute-release policy id bound to this partner. */
  attributePolicyId?: string;
  /** Whether JIT provisioning is permitted for this partner. */
  jitProvisioning: boolean;
  /** Whether SLO propagation is enabled for this partner. */
  sloPropagation: boolean;
  /** Trusted since (epoch ms). */
  establishedAt: number;
  /** Optional allowlist of acceptable signature algorithms. */
  allowedAlgorithms?: string[];
}

// -------------------------------------------------------------------
// Protocol messages — OIDC-ish
// -------------------------------------------------------------------

/** Authorization request params (OIDC-ish). */
export interface OidcAuthorizationRequest {
  responseType: 'code';
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  /** PKCE. */
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
}

/** Token response payload (OIDC-ish). */
export interface OidcTokenResponse {
  accessToken: string;
  idToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken?: string;
}

/** Decoded ID-token claims (OIDC-ish). */
export interface OidcIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  /** Additional released attributes. */
  [claim: string]: unknown;
}

// -------------------------------------------------------------------
// Protocol messages — SAML-ish
// -------------------------------------------------------------------

/** A SAML-ish AuthnRequest. */
export interface SamlAuthnRequest {
  id: string;
  issuer: string;
  issueInstant: number;
  assertionConsumerServiceUrl: string;
  /** Requested NameID format. */
  nameIdPolicyFormat?: NameIdFormat;
  /** Relay state echoed back. */
  relayState?: string;
}

/** A signed SAML-ish assertion. */
export interface SamlAssertion {
  id: string;
  issuer: string;
  subject: { nameId: string; nameIdFormat: NameIdFormat };
  /** Audience restriction + conditions. */
  conditions: { notBefore: number; notOnOrAfter: number; audience: string };
  attributes: Record<string, string[]>;
  authnContextClassRef: string;
  /** Session index for SLO correlation. */
  sessionIndex?: string;
  /** Signature stub over canonicalized assertion. */
  signature: { kid: string; alg: string; value: string };
}

/** A SAML-ish Response wrapper. */
export interface SamlResponse {
  id: string;
  inResponseTo: string;
  issuer: string;
  destination: string;
  issueInstant: number;
  status: 'Success' | 'Requester' | 'Responder' | 'VersionMismatch';
  assertion?: SamlAssertion;
  relayState?: string;
}

/** A SAML-ish SingleLogout request/response. */
export interface SamlLogoutMessage {
  id: string;
  issuer: string;
  issueInstant: number;
  /** NameID of the principal being logged out. */
  nameId?: string;
  /** Session index to terminate; undefined = all sessions for NameID. */
  sessionIndex?: string;
  destination: string;
  /** For responses: status of the logout attempt. */
  status?: 'Success' | 'PartialLogout' | 'Requester';
  inResponseTo?: string;
}

// -------------------------------------------------------------------
// NameID
// -------------------------------------------------------------------

export enum NameIdFormat {
  PERSISTENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  TRANSIENT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  EMAIL = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  UNSPECIFIED = 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
}

// -------------------------------------------------------------------
// Attribute release
// -------------------------------------------------------------------

/** One rule in an attribute-release policy. */
export interface AttributeRule {
  /** Attribute name (exact match) or '*' wildcard suffix, e.g. 'groups.*'. */
  attribute: string;
  action: 'release' | 'deny';
  /** Optional value filter: only listed values are released. */
  values?: string[];
}

/** Per-SP (relying-party) attribute release policy. */
export interface AttributeReleasePolicy {
  id: string;
  /** Rules evaluated in order; first match wins. Default: deny. */
  rules: AttributeRule[];
}

// -------------------------------------------------------------------
// Federation session & results
// -------------------------------------------------------------------

/** A federated authentication result handed to the application layer. */
export interface FederatedIdentity {
  /** IdP entityId that asserted this identity. */
  idpEntityId: string;
  /** Subject identifier in the negotiated NameID format. */
  nameId: string;
  nameIdFormat: NameIdFormat;
  /** Attributes after release-policy filtering. */
  attributes: Record<string, string[]>;
  /** Session index for SLO correlation. */
  sessionIndex: string;
  /** Assertion/issue timestamps. */
  authenticatedAt: number;
  expiresAt: number;
}

/** A tracked federation session for SLO propagation. */
export interface FederationSession {
  sessionIndex: string;
  /** Stable subject key (persistent nameId or provisioned user id). */
  subjectKey: string;
  idpEntityId: string;
  /** SPs that share this session (for SLO broadcast). */
  participantEntityIds: Set<string>;
  createdAt: number;
}

/** Result of an SP-initiated logout. */
export interface SloResult {
  sessionIndex: string;
  /** Per-participant outcome. */
  propagated: Array<{ entityId: string; ok: boolean; error?: string }>;
}

/** Provisioning record created by JIT. */
export interface ProvisionedUser {
  id: string;
  /** Owning IdP. */
  idpEntityId: string;
  /** Persistent subject key from the IdP. */
  subjectKey: string;
  attributes: Record<string, string[]>;
  createdAt: number;
  /** Whether this record was just created (vs. matched existing). */
  justCreated: boolean;
}

/** Engine configuration. */
export interface FederationEngineConfig {
  /** This entity's IdP entityId / issuer. */
  idpEntityId: string;
  /** Assertion/session TTL ms. */
  assertionTtlMs: number;
  /** Auth code TTL ms (OIDC-ish). */
  authCodeTtlMs: number;
  /** Clock skew tolerance ms for time-bound conditions. */
  clockSkewMs: number;
  /** Signing algorithm used for outgoing assertions. */
  signatureAlgorithm: string;
}

export const DEFAULT_FEDERATION_CONFIG: FederationEngineConfig = {
  idpEntityId: 'https://idp.local/federation',
  assertionTtlMs: 5 * 60 * 1000,
  authCodeTtlMs: 60 * 1000,
  clockSkewMs: 60 * 1000,
  signatureAlgorithm: 'RS256-stub',
};

/** Error codes for the federation engine. */
export enum FederationErrorCode {
  UNKNOWN_ENTITY = 'UNKNOWN_ENTITY',
  BAD_REQUEST = 'BAD_REQUEST',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  ASSERTION_EXPIRED = 'ASSERTION_EXPIRED',
  AUDIENCE_MISMATCH = 'AUDIENCE_MISMATCH',
  UNKNOWN_SESSION = 'UNKNOWN_SESSION',
  POLICY_DENIED = 'POLICY_DENIED',
  UNSUPPORTED_NAMEID = 'UNSUPPORTED_NAMEID',
  TOKEN_INVALID = 'TOKEN_INVALID',
  STATE_MISMATCH = 'STATE_MISMATCH',
}

export class FederationError extends Error {
  readonly code: FederationErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: FederationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FederationError';
    this.code = code;
    this.details = details;
  }
}
