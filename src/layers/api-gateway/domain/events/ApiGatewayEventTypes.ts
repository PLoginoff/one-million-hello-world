/**
 * ApiGateway Event Types
 *
 * Defines all event types specific to the ApiGateway layer.
 * Each event type has a specific payload structure for type safety.
 */

export enum ApiGatewayEventType {
  REQUEST_RECEIVED = 'api_gateway.request_received',
  REQUEST_ROUTED = 'api_gateway.request_routed',
  REQUEST_FORWARDED = 'api_gateway.request_forwarded',
  RESPONSE_RECEIVED = 'api_gateway.response_received',
  RESPONSE_SENT = 'api_gateway.response_sent',
  RATE_LIMIT_EXCEEDED = 'api_gateway.rate_limit_exceeded',
  AUTH_FAILED = 'api_gateway.auth_failed',
  CIRCUIT_BREAKER_OPEN = 'api_gateway.circuit_breaker_open',
  CIRCUIT_BREAKER_CLOSED = 'api_gateway.circuit_breaker_closed',
  SERVICE_DISCOVERY_CHANGED = 'api_gateway.service_discovery_changed',
  HEALTH_CHECK_FAILED = 'api_gateway.health_check_failed',
  HEALTH_CHECK_RECOVERED = 'api_gateway.health_check_recovered',
  SSL_CERT_EXPIRING = 'api_gateway.ssl_cert_expiring',
  CONFIG_RELOADED = 'api_gateway.config_reloaded',
  CUSTOM_EVENT = 'api_gateway.custom_event',
}

export interface RequestReceivedPayload {
  requestId: string;
  method: string;
  path: string;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  clientIp: string;
  userAgent?: string;
  timestamp: number;
  serviceName?: string;
  routeId?: string;
}

export interface RequestRoutedPayload {
  requestId: string;
  routeId: string;
  serviceName: string;
  targetUrl: string;
  routingRule: string;
  latencyMs: number;
}

export interface RequestForwardedPayload {
  requestId: string;
  targetUrl: string;
  upstreamLatencyMs: number;
  retryCount: number;
  loadBalancerStrategy: string;
}

export interface ResponseReceivedPayload {
  requestId: string;
  statusCode: number;
  responseTimeMs: number;
  responseSize: number;
  cacheHit: boolean;
  upstreamService: string;
}

export interface ResponseSentPayload {
  requestId: string;
  statusCode: number;
  totalLatencyMs: number;
  responseSize: number;
  compressionApplied: boolean;
}

export interface RateLimitExceededPayload {
  requestId: string;
  identifier: string;
  limit: number;
  windowMs: number;
  currentCount: number;
  retryAfterMs: number;
  scope: 'global' | 'route' | 'service' | 'ip' | 'user';
}

export interface AuthFailedPayload {
  requestId: string;
  authType: 'jwt' | 'api_key' | 'basic' | 'oauth2' | 'mtls';
  reason: 'invalid_token' | 'expired_token' | 'missing_token' | 'invalid_signature' | 'insufficient_scope' | 'revoked';
  clientIp: string;
  userId?: string;
}

export interface CircuitBreakerPayload {
  serviceName: string;
  endpoint: string;
  failureCount: number;
  successCount: number;
  threshold: number;
  state: 'open' | 'half_open' | 'closed';
  nextAttemptMs?: number;
}

export interface ServiceDiscoveryPayload {
  serviceName: string;
  eventType: 'registered' | 'deregistered' | 'health_changed' | 'metadata_changed';
  instanceId: string;
  endpoints: string[];
  metadata?: Record<string, string>;
  healthy: boolean;
}

export interface HealthCheckPayload {
  serviceName: string;
  endpoint: string;
  checkType: 'liveness' | 'readiness' | 'startup';
  result: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs: number;
  details?: Record<string, unknown>;
  consecutiveFailures: number;
}

export interface SslCertPayload {
  domain: string;
  expiresAt: number;
  daysUntilExpiry: number;
  issuer: string;
  sanList: string[];
}

export interface ConfigReloadedPayload {
  configVersion: string;
  changedSections: string[];
  reloadTrigger: 'manual' | 'file_watch' | 'signal' | 'api';
  success: boolean;
  error?: string;
}

export interface CustomEventPayload {
  eventName: string;
  payload: Record<string, unknown>;
}

export type ApiGatewayEventPayload =
  | RequestReceivedPayload
  | RequestRoutedPayload
  | RequestForwardedPayload
  | ResponseReceivedPayload
  | ResponseSentPayload
  | RateLimitExceededPayload
  | AuthFailedPayload
  | CircuitBreakerPayload
  | ServiceDiscoveryPayload
  | HealthCheckPayload
  | SslCertPayload
  | ConfigReloadedPayload
  | CustomEventPayload;

export interface ApiGatewayDomainEvent<T extends ApiGatewayEventType = ApiGatewayEventType> {
  type: T;
  payload: ApiGatewayEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}
