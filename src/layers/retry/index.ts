/**
 * Retry Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Retry Layer (Layer 19 of the 25-layer architecture).
 *
 * The Retry Layer provides exponential backoff,
 * jitter, and idempotency with Clean Architecture.
 *
 * @module RetryLayer
 */

// Legacy exports (backward compatibility)
export { IRetryPolicy } from './interfaces/IRetryPolicy';
export { RetryPolicy as LegacyRetryPolicy } from './implementations/RetryPolicy';
export * from './types/retry-types';

// New Clean Architecture exports

// Domain Layer
export { RetryAttemptEntity } from './domain/entities/RetryAttempt';
export { AttemptMetadata, AttemptMetadataData } from './domain/value-objects/AttemptMetadata';
export { RetryPolicy, RetryPolicyData, BackoffStrategy } from './domain/value-objects/RetryPolicy';
export { RetryCondition, RetryConditionData } from './domain/value-objects/RetryCondition';
export {
  RetryValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/RetryValidationService';

// Configuration Layer
export { RetryDefaults, RetryConfigDefaults } from './configuration/defaults/RetryDefaults';
export { RetryConfigBuilder, RetryBuilderConfig } from './configuration/builders/RetryConfigBuilder';
export {
  RetryConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/RetryConfigValidator';

