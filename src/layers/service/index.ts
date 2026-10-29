/**
 * Service Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Service Layer (Layer 9 of the 25-layer architecture).
 *
 * The Service Layer provides business logic, use cases,
 * and domain operations.
 *
 * @module ServiceLayer
 */

export { IService } from './interfaces/IService';
export { Service } from './implementations/Service';
export { ServiceResult, ServiceContext, UseCase, ServiceConfig } from './types/service-types';
export type { ServiceError } from './types/service-types';

// Domain
export { ServiceConfigState, ServiceConfigStateData } from './domain/entities/ServiceConfigState';
export { ServiceEntity } from './domain/entities/ServiceEntity';
export { ServiceExecution, ServiceExecutionData } from './domain/entities/ServiceExecution';
export { ServiceMetrics, ServiceMetricsData } from './domain/entities/ServiceMetrics';
export { ServiceService } from './domain/services/ServiceService';
export { ServiceDiscoveryService, ServiceRegistration } from './domain/services/ServiceDiscoveryService';
export { ServiceExecutionService } from './domain/services/ServiceExecutionService';
export { ServiceValidationService } from './domain/services/ServiceValidationService';
export { ServiceQueryService } from './domain/services/ServiceQueryService';
export { ServiceStatusValueObject, ServiceStatus } from './domain/value-objects/ServiceStatusValueObject';
export { ServiceThreshold } from './domain/value-objects/ServiceThreshold';
export { ServiceTimeWindow } from './domain/value-objects/ServiceTimeWindow';
export { ServicePriority } from './domain/value-objects/ServicePriority';

// Configuration
export { ServiceDEFAULTS, ServiceLIMITS, ServiceSTRATEGIES } from './configuration/defaults/ServiceDefaults';
export { ServiceConfigurationBuilder, ServiceConfiguration } from './configuration/builders/ServiceConfigurationBuilder';
export { ServiceConfigurationValidator, ValidationResult } from './configuration/validators/ServiceConfigurationValidator';

// Strategies
export { ServiceDefaultStrategy } from './strategies/DefaultStrategy';
export { ServiceFastStrategy } from './strategies/FastStrategy';
export { ServiceReliableStrategy } from './strategies/ReliableStrategy';
export { ServiceCachedStrategy } from './strategies/CachedStrategy';
export { ServiceBatchStrategy } from './strategies/BatchStrategy';
export { DefaultServiceStrategy } from './strategies/DefaultServiceStrategy';
export { LoggingServiceStrategy, ILogger } from './strategies/LoggingServiceStrategy';
export { MetricsServiceStrategy, StrategyMetricsSnapshot } from './strategies/MetricsServiceStrategy';
export { RetryServiceStrategy, RetryOptions, RetryMetrics } from './strategies/RetryServiceStrategy';
export { CachedServiceStrategy, CacheOptions, CacheMetrics } from './strategies/CachedServiceStrategy';
export type { IServiceStrategy } from './strategies/IServiceStrategy';

// Legacy strategy implementations (entity-based)
export { SynchronousServiceStrategy } from './strategies/strategy/SynchronousServiceStrategy';
export { AsynchronousServiceStrategy } from './strategies/strategy/AsynchronousServiceStrategy';
export { CachingServiceStrategy } from './strategies/strategy/CachingServiceStrategy';
export { DefaultServiceStrategy as LegacyDefaultServiceStrategy } from './strategies/strategy/DefaultServiceStrategy';
export { RetryServiceStrategy as LegacyRetryServiceStrategy } from './strategies/strategy/RetryServiceStrategy';

// Factories
export { ServiceStrategyFactory } from './factories/ServiceStrategyFactory';
export { ServiceFactory } from './factories/ServiceFactory';

// Health
export {
  ServiceHealthCheck,
  ServiceHealthCheckResult,
  ServiceHealthCheckEntry,
  ServiceHealthStatus,
} from './health/ServiceHealthCheck';

// Metrics
export { ServiceMetricsCollector, ServiceMetricSample } from './metrics/ServiceMetricsCollector';
export type { ServiceMetrics as ServiceMetricsSnapshot } from './metrics/ServiceMetricsCollector';

// Statistics
export { ServiceStatistics, ServiceStats } from './statistics/ServiceStatistics';

// Errors
export { ServiceError as ServiceErrorClass, ServiceErrorDetails } from './errors/ServiceError';
export { UseCaseNotFoundError } from './errors/UseCaseNotFoundError';
export { UseCaseExecutionError } from './errors/UseCaseExecutionError';
export { ServiceConfigurationError } from './errors/ServiceConfigurationError';
export { RetryExhaustedError } from './errors/RetryExhaustedError';

// Utils
export { ServiceError as ServiceLegacyError } from './utils/ServiceError';
export { ServiceHelpers } from './utils/ServiceHelpers';
export { ServiceErrorMapper, MappedServiceError } from './utils/ServiceErrorMapper';
