/**
 * Strategy Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Strategy Layer (Layer 21 of the 25-layer architecture).
 *
 * The Strategy Layer provides execution strategies,
 * A/B testing, and feature flags with Clean Architecture.
 *
 * @module StrategyLayer
 */

// Legacy exports (backward compatibility)
export { IStrategyManager } from './interfaces/IStrategyManager';
export { StrategyManager } from './implementations/StrategyManager';
export * from './types/strategy-types';

// New Clean Architecture exports

// Domain Layer
export { StrategyExecutionEntity } from './domain/entities/StrategyExecution';
export { ExecutionMetadata, ExecutionMetadataData } from './domain/value-objects/ExecutionMetadata';
export { StrategyConfig, StrategyConfigData, RetryPolicy } from './domain/value-objects/StrategyConfig';
export { FeatureFlag, FeatureFlagData, FlagCondition } from './domain/value-objects/FeatureFlag';
export {
  StrategyValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/StrategyValidationService';

// Configuration Layer
export { StrategyDefaults, StrategyConfigDefaults } from './configuration/defaults/StrategyDefaults';
export { StrategyConfigBuilder, StrategyBuilderConfig } from './configuration/builders/StrategyConfigBuilder';
export {
  StrategyConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/StrategyConfigValidator';
