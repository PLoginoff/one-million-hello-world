/**
 * IdentityProvider Engine2 — protocol negotiation, attribute
 * transformation, token exchange, provisioning webhooks, health.
 *
 * @module IdentityProvider/Engine2
 */

export { ProtocolNegotiator, FederationProtocol, detectProtocol } from './ProtocolNegotiator';
export type { PartnerCapabilities, RequestSignals, NegotiationResult } from './ProtocolNegotiator';

export {
  AttributeTransformer,
  expandTemplate,
  SAML_TO_OIDC_RULES,
  OIDC_FLATTEN_RULES,
} from './AttributeTransformer';
export type { AttributeBag, TransformRule, RuleTrace, TransformResult } from './AttributeTransformer';

export { TokenBroker } from './TokenBroker';
export type { FederatedToken, IssuedToken, ExchangeRequest, ExchangeAuditEntry } from './TokenBroker';

export { ProvisioningWebhookDispatcher, InMemoryWebhookTransport, signBody, verifySignature } from './ProvisioningWebhooks';
export type {
  ProvisioningEventType,
  ProvisioningEvent,
  WebhookDelivery,
  WebhookTransport,
  WebhookSubscriber,
  WebhookConfig,
} from './ProvisioningWebhooks';

export { IdpHealthMonitor, EndpointHealth } from './IdpHealthMonitor';
export type { MonitoredEndpoint, ProbeResult, EndpointProbe, HealthMonitorConfig, EndpointStatus } from './IdpHealthMonitor';
