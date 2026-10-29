/**
 * Security Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Security Layer (Layer 3 of the 25-layer architecture).
 *
 * The Security Layer provides authentication, authorization, CORS validation,
 * and threat detection for HTTP requests.
 *
 * @module SecurityLayer
 */

export { ISecurityManager } from './interfaces/ISecurityManager';
export { SecurityManager } from './implementations/SecurityManager';

// Types
export {
  SecurityContext,
  CorsConfig,
  AuthCredentials,
  AuthResult,
  SecurityLevel,
  ThreatSeverity,
  ThreatDetectionResult,
  ThreatType,
  SecurityPolicyConfig,
  RateLimitConfig,
  IPFilterConfig,
  UserAgentFilterConfig,
  SignatureConfig,
  TimestampConfig,
  NonceConfig,
  SecurityStats,
  SecurityAuditLog,
  SecurityEvent,
  TokenInfo,
  SessionInfo,
  IPInfo,
  RateLimitEntry,
  NonceEntry,
  SecurityDiagnostics,
  DiagnosticStep,
  DiagnosticSummary,
  ExtendedSecurityContext,
  AuthMethod,
  ExtendedAuthResult,
  SecurityWarning,
  ExtendedThreatDetectionResult,
} from './types/security-types';
export type { SecurityError, SecurityErrorCode, SecurityHealthStatus, SecurityHealthCheck, SecurityMetrics } from './types/security-types';

// Domain
export { PolicyEntity } from './domain/entities/PolicyEntity';
export { SecurityConfigState, SecurityConfigStateData } from './domain/entities/SecurityConfigState';
export { SecurityContextEntity } from './domain/entities/SecurityContextEntity';
export { SecurityExecution, SecurityExecutionData } from './domain/entities/SecurityExecution';
export { SecurityMetricsSnapshot } from './domain/entities/SecurityMetricsSnapshot';
export { ThreatEntity } from './domain/entities/ThreatEntity';
export { SecurityLevelValueObject } from './domain/value-objects/SecurityLevelValueObject';
export { ThreatSeverityValueObject } from './domain/value-objects/ThreatSeverityValueObject';
export { SecurityThreshold } from './domain/value-objects/SecurityThreshold';
export { SecurityTimeWindow } from './domain/value-objects/SecurityTimeWindow';
export { SecurityPriority } from './domain/value-objects/SecurityPriority';
export { SecurityValidationService } from './domain/services/SecurityValidationService';
export { SecurityPolicyService } from './domain/services/SecurityPolicyService';
export { SecurityExecutionService } from './domain/services/SecurityExecutionService';
export { SecurityQueryService } from './domain/services/SecurityQueryService';

// Configuration
export { SecurityConfigurationBuilder, SecurityConfiguration } from './configuration/builders/SecurityConfigurationBuilder';
export { SecurityDEFAULTS, SecurityLIMITS, SecuritySTRATEGIES } from './configuration/defaults/SecurityDefaults';
export { SecurityConfigurationValidator, ValidationResult } from './configuration/validators/SecurityConfigurationValidator';

// Strategies
export {
  ISecurityStrategy,
  SecurityStrategyContext,
  StrategyResult,
  DefaultSecurityStrategy,
  LoggingSecurityStrategy,
  LoggingSecurityStrategyOptions,
  SecurityLogger,
  LoggingSecurityStrategyFactory,
  MetricsSecurityStrategy,
  MetricsSecurityStrategyOptions,
  MetricsSecurityStrategyFactory,
  SecurityDefaultStrategy,
  SecurityFastStrategy,
  SecurityReliableStrategy,
  SecurityCachedStrategy,
  SecurityBatchStrategy,
  SecurityLoggingStrategy,
  SecurityMetricsStrategy,
  SecurityLoggingStrategyFactory,
  SecurityMetricsStrategyFactory,
} from './strategies';
export type { ISecurityLegacyStrategy, SecurityLegacyLogger } from './strategies';

// Factories
export { SecurityStrategyFactory } from './factories/SecurityStrategyFactory';

// Health
export {
  SecurityHealthCheck as SecurityHealthChecker,
  SecurityHealthCheckResult,
  SecurityHealthCheckEntry,
} from './health/SecurityHealthCheck';
export type { SecurityHealthStatus as SecurityHealthCheckStatus } from './health/SecurityHealthCheck';

// Metrics
export { SecurityMetricsCollector, SecurityMetricSample } from './metrics/SecurityMetricsCollector';
export type { SecurityMetrics as SecurityMetricsData } from './metrics/SecurityMetricsCollector';

// Errors
export {
  SecurityError as SecurityErrorBase,
  SecurityConfigurationError,
  SecurityExecutionError,
  SecurityTimeoutError,
  SecurityValidationError,
  SecurityAuthenticationError,
  SecurityAuthorizationError,
  SecurityThreatDetectedError,
  SecurityRateLimitExceededError,
  SecurityCorsViolationError,
  SecuritySessionExpiredError,
  SecurityPolicyViolationError,
  SecurityErrorFactory,
} from './errors/SecurityError';
export type { SecurityErrorContext, SecurityErrorCode as SecurityErrorCodeType } from './errors/SecurityError';

// Adapters
export { SecurityInMemoryAdapter } from './adapters/InMemoryAdapter';
export { SecurityMockAdapter } from './adapters/MockAdapter';
export { SecurityStubAdapter } from './adapters/StubAdapter';
export {
  SecurityRedisAdapter,
  SecurityRedisAdapterOptions,
  RedisClient,
  SecurityRedisAdapterFactory,
} from './adapters/RedisAdapter';

// Utils
export { SecurityError as SecurityLegacyError } from './utils/SecurityError';
export { SecurityHelpers } from './utils/SecurityHelpers';
export { SecurityErrorMapper, MappedSecurityError } from './utils/SecurityErrorMapper';
