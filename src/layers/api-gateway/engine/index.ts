/**
 * API Gateway Engine — public exports.
 *
 * @module ApiGatewayLayer/Engine
 */

export * from './types';
export {
  RouteMatcher,
  compareVersions,
  extractRequestVersion,
  versionSatisfies,
} from './RouteMatcher';
export { TransformPipeline } from './TransformPipeline';
export type { TransformResult, TransformedRequest } from './TransformPipeline';
export { ApiKeyManager } from './ApiKeyManager';
export type { ApiKeyRecord, ApiKeyStatus, IssuedKey, VerifyResult } from './ApiKeyManager';
export { TokenBucketRateLimiter } from './RateLimiter';
export { CircuitBreakerRegistry, CircuitOpenError } from './CircuitBreaker';
export type { CircuitStats } from './CircuitBreaker';
export {
  AccessLogger,
  InMemoryLogSink,
  maskValue,
  maskHeaders,
  DEFAULT_PII_MASKING_CONFIG,
} from './PiiMaskingLogger';
export type { AccessLogEntry, LogSink, PiiMaskingConfig } from './PiiMaskingLogger';
export { GatewayResponseCache } from './ResponseCache';
export type {
  CacheLookup,
  CachedResponse,
  ResponseCacheStats,
} from './ResponseCache';
export { GatewayEngine } from './GatewayEngine';
export type {
  UpstreamTransport,
  GatewayEngineConfig,
  GatewayOutcome,
  HandledResponse,
} from './GatewayEngine';
