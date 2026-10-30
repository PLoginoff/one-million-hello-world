/**
 * SSO Engine 2 — public surface.
 *
 * Cross-domain session federation, single-logout propagation with
 * backchannel delivery, identity linking, JIT provisioning policies and
 * a tamper-evident audit trail.
 *
 * @module Sso/Engine2
 */

export { FederationError, SessionFederation } from './SessionFederation';
export type {
  FederatedSession,
  FederationOptions,
  FederationToken,
} from './SessionFederation';

export { LogoutPropagator } from './LogoutPropagation';
export type {
  DeliveryRecord,
  ILogoutTransport,
  LogoutChannel,
  LogoutOptions,
  LogoutRequestDescriptor,
  RelyingParty,
  RpSession,
  SleepFn,
} from './LogoutPropagation';

export { IdentityLinker, LinkError } from './IdentityLinking';
export type {
  IdpIdentity,
  LinkConflict,
  LinkResult,
  Principal,
} from './IdentityLinking';

export { applyTransform, JitProvisioner } from './JitProvisioning';
export type {
  AttributeRule,
  ClaimTransform,
  ProvisionedAccount,
  ProvisioningPolicy,
  ProvisionOutcome,
  RoleRule,
} from './JitProvisioning';

export { TokenExchange } from './TokenExchange';
export type { ExchangePolicy, ExchangeRequest, TokenClaims } from './TokenExchange';

export { SsoAuditTrail } from './SsoAudit';
export type { AuditQuery, IEventSink, SsoEvent, SsoEventType } from './SsoAudit';
