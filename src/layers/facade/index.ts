/**
 * Facade Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Facade Layer (Layer 22 of the 25-layer architecture).
 *
 * The Facade Layer provides simplified interfaces,
 * aggregation, and composition with Clean Architecture.
 *
 * @module FacadeLayer
 */

// Legacy exports (backward compatibility)
export { IFacade } from './interfaces/IFacade';
export { Facade } from './implementations/Facade';
export * from './types/facade-types';

// New Clean Architecture exports

// Domain Layer
export { FacadeOperationEntity } from './domain/entities/FacadeOperation';
export { OperationMetadata, OperationMetadataData } from './domain/value-objects/OperationMetadata';
export { FacadeConfig, FacadeConfigData, RetryPolicy } from './domain/value-objects/FacadeConfig';
export { ServiceComposition, ServiceCompositionData, ServiceDefinition, ExecutionOrder, TimeoutStrategy } from './domain/value-objects/ServiceComposition';
export {
  FacadeValidationService,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './domain/services/FacadeValidationService';

// Configuration Layer
export { FacadeDefaults, FacadeConfigDefaults } from './configuration/defaults/FacadeDefaults';
export { FacadeConfigBuilder, FacadeBuilderConfig } from './configuration/builders/FacadeConfigBuilder';
export {
  FacadeConfigValidator,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from './configuration/validators/FacadeConfigValidator';

