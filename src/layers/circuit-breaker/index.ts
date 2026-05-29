/**
 * Circuit Breaker Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Circuit Breaker Layer (Layer 18 of the 25-layer architecture).
 *
 * The Circuit Breaker Layer provides fault tolerance
 * and fallback strategies with Clean Architecture.
 *
 * @module CircuitBreakerLayer
 */

// Legacy exports (backward compatibility)
export { ICircuitBreaker, FallbackFunction } from './interfaces/ICircuitBreaker';
export { CircuitBreaker } from './implementations/CircuitBreaker';
export * from './types/circuit-breaker-types';

// New Clean Architecture exports

// Domain Layer
export { CircuitStateEntity } from './domain/entities/CircuitState';
export { StateTransition, StateMetadata, StateTransitionBuilder } from './domain/value-objects/StateTransition';
export { CircuitMetrics, CircuitMetricsData } from './domain/value-objects/CircuitMetrics';
export { CircuitThreshold, CircuitThresholdData } from './domain/value-objects/CircuitThreshold';
export {
  CircuitValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/CircuitValidationService';

// Configuration Layer
export { CircuitDefaults, CircuitConfigDefaults } from './configuration/defaults/CircuitDefaults';
export { CircuitConfigBuilder, CircuitConfig } from './configuration/builders/CircuitConfigBuilder';
export {
  CircuitConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/CircuitConfigValidator';

// Strategies Layer
export {
  IFallbackStrategy,
  FallbackContext,
  FallbackResult,
} from './strategies/fallback/IFallbackStrategy';
export { DefaultFallbackStrategy } from './strategies/fallback/DefaultFallbackStrategy';
export { CacheFallbackStrategy, CacheFallbackOptions } from './strategies/fallback/CacheFallbackStrategy';
export { DefaultValueFallbackStrategy } from './strategies/fallback/DefaultValueFallbackStrategy';
export {
  IStateTransitionStrategy,
  TransitionContext,
  DefaultStateTransitionStrategy,
} from './strategies/state-transition/StateTransitionStrategy';

// Statistics Layer
export { CircuitStatisticsCollector, CircuitStatistics } from './statistics/collectors/CircuitStatisticsCollector';
export { CircuitPerformanceMetrics, PerformanceMetrics } from './statistics/metrics/CircuitPerformanceMetrics';

// Factories Layer
export { CircuitFactory, CircuitInstance, CircuitFactoryOptions } from './factories/CircuitFactory';
export { StrategyFactory, StrategyFactoryOptions } from './factories/StrategyFactory';

// Utils Layer
export {
  CircuitError,
  CircuitOpenError,
  CircuitConfigError,
  CircuitStateError,
  CircuitValidationError,
  CircuitMetricsError,
  CircuitTimeoutError,
} from './utils/errors/CircuitError';
export { CircuitHelper } from './utils/helpers/CircuitHelper';
