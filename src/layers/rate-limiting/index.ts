/**
 * Rate Limiting Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Rate Limiting Layer (Layer 4 of the 25-layer architecture).
 *
 * The Rate Limiting Layer provides IP-based, user-based, and API key-based
 * rate limiting with multiple strategies with Clean Architecture.
 *
 * @module RateLimitingLayer
 */

// Legacy exports (backward compatibility)
export { IRateLimiter } from './interfaces/IRateLimiter';
export { RateLimiter } from './implementations/RateLimiter';
export * from './types/rate-limiting-types';

// New Clean Architecture exports
export { RateLimitRequestEntity } from './domain/entities/RateLimitRequest';
export { RequestMetadata, RequestMetadataData } from './domain/value-objects/RequestMetadata';
export { RateLimitConfig as DomainRateLimitConfig, RateLimitConfigData, WindowUnit, RateLimitAlgorithm } from './domain/value-objects/RateLimitConfig';
export { RateLimitRule as DomainRateLimitRule, RateLimitRuleData, RuleCondition } from './domain/value-objects/RateLimitRule';
export {
  RateLimitValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/RateLimitValidationService';
export { RateLimitDefaults, RateLimitConfigDefaults } from './configuration/defaults/RateLimitDefaults';
export * from './strategies';
export * from './factories';
export * from './utils';
