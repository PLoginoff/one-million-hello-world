/**
 * Facade Validation Service
 *
 * Domain service for validating facade operations and configurations.
 * Provides validation logic for facades, compositions, and operations.
 */

import { FacadeConfig } from '../value-objects/FacadeConfig';
import { ServiceComposition } from '../value-objects/ServiceComposition';
import { FacadeOperationEntity } from '../entities/FacadeOperation';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export class FacadeValidationService {
  /**
   * Validate facade configuration
   */
  validateFacadeConfig(config: FacadeConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.getName() || config.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Facade name is required',
        code: 'FACADE_NAME_REQUIRED',
      });
    }

    if (config.getTimeout() <= 0) {
      errors.push({
        field: 'timeout',
        message: 'Timeout must be positive',
        code: 'INVALID_TIMEOUT',
      });
    }

    const retryPolicy = config.getRetryPolicy();
    if (retryPolicy.maxAttempts < 1) {
      errors.push({
        field: 'retryPolicy.maxAttempts',
        message: 'Max attempts must be at least 1',
        code: 'INVALID_MAX_ATTEMPTS',
      });
    }

    if (retryPolicy.initialDelay < 0) {
      errors.push({
        field: 'retryPolicy.initialDelay',
        message: 'Initial delay must be non-negative',
        code: 'INVALID_INITIAL_DELAY',
      });
    }

    if (retryPolicy.maxDelay < retryPolicy.initialDelay) {
      errors.push({
        field: 'retryPolicy.maxDelay',
        message: 'Max delay must be greater than or equal to initial delay',
        code: 'INVALID_MAX_DELAY',
      });
    }

    if (!config.isEnabled()) {
      warnings.push({
        field: 'enabled',
        message: 'Facade is disabled',
        code: 'FACADE_DISABLED',
      });
    }

    if (!config.isFallbackEnabled()) {
      warnings.push({
        field: 'fallbackEnabled',
        message: 'Fallback is disabled',
        code: 'FALLBACK_DISABLED',
      });
    }

    if (retryPolicy.maxAttempts > 5) {
      warnings.push({
        field: 'retryPolicy.maxAttempts',
        message: 'High retry count may impact performance',
        code: 'HIGH_RETRY_COUNT',
      });
    }

    if (config.getTimeout() > 60000) {
      warnings.push({
        field: 'timeout',
        message: 'Timeout is very high',
        code: 'HIGH_TIMEOUT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate service composition
   */
  validateServiceComposition(composition: ServiceComposition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const services = composition.getServices();

    if (services.length === 0) {
      errors.push({
        field: 'services',
        message: 'At least one service is required',
        code: 'SERVICES_REQUIRED',
      });
    }

    if (composition.getMaxConcurrentServices() < 1) {
      errors.push({
        field: 'maxConcurrentServices',
        message: 'Max concurrent services must be at least 1',
        code: 'INVALID_MAX_CONCURRENT',
      });
    }

    if (composition.isParallelismEnabled() && composition.getMaxConcurrentServices() > services.length) {
      errors.push({
        field: 'maxConcurrentServices',
        message: 'Max concurrent services cannot exceed total services',
        code: 'MAX_CONCURRENT_EXCEEDED',
      });
    }

    const requiredServices = composition.getRequiredServices();
    if (requiredServices.length === 0) {
      warnings.push({
        field: 'services',
        message: 'No required services defined',
        code: 'NO_REQUIRED_SERVICES',
      });
    }

    if (composition.getExecutionOrder() === 'parallel' && requiredServices.length > 1) {
      warnings.push({
        field: 'executionOrder',
        message: 'Parallel execution with multiple required services may cause race conditions',
        code: 'PARALLEL_REQUIRED_SERVICES',
      });
    }

    if (services.length > 10) {
      warnings.push({
        field: 'services',
        message: 'Too many services in composition',
        code: 'TOO_MANY_SERVICES',
      });
    }

    for (const service of services) {
      if (service.timeout > 30000) {
        warnings.push({
          field: `services.${service.id}.timeout`,
          message: `Service ${service.name} has high timeout`,
          code: 'HIGH_SERVICE_TIMEOUT',
        });
      }

      if (service.retryPolicy.maxAttempts > 3) {
        warnings.push({
          field: `services.${service.id}.retryPolicy.maxAttempts`,
          message: `Service ${service.name} has high retry count`,
          code: 'HIGH_SERVICE_RETRY_COUNT',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate facade operation
   */
  validateFacadeOperation(operation: FacadeOperationEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!operation.operationId || operation.operationId.trim().length === 0) {
      errors.push({
        field: 'operationId',
        message: 'Operation ID is required',
        code: 'OPERATION_ID_REQUIRED',
      });
    }

    if (!operation.facadeId || operation.facadeId.trim().length === 0) {
      errors.push({
        field: 'facadeId',
        message: 'Facade ID is required',
        code: 'FACADE_ID_REQUIRED',
      });
    }

    if (operation.getDuration() < 0) {
      errors.push({
        field: 'duration',
        message: 'Duration cannot be negative',
        code: 'INVALID_DURATION',
      });
    }

    if (operation.getStartTime() <= 0) {
      errors.push({
        field: 'startTime',
        message: 'Start time must be positive',
        code: 'INVALID_START_TIME',
      });
    }

    if (operation.isFailed() && !operation.metadata.hasError()) {
      warnings.push({
        field: 'status',
        message: 'Operation is failed but has no error message',
        code: 'FAILED_OPERATION_NO_ERROR',
      });
    }

    if (operation.isCompleted() && operation.result === undefined) {
      warnings.push({
        field: 'result',
        message: 'Operation is completed but has no result',
        code: 'COMPLETED_OPERATION_NO_RESULT',
      });
    }

    if (operation.metadata.getRetryCount() > 3) {
      warnings.push({
        field: 'retryCount',
        message: 'High retry count detected',
        code: 'HIGH_RETRY_COUNT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate operation parameters
   */
  validateOperationParameters(parameters: Record<string, unknown>, requiredParams: string[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const param of requiredParams) {
      if (!(param in parameters)) {
        errors.push({
          field: param,
          message: `Required parameter '${param}' is missing`,
          code: 'REQUIRED_PARAMETER_MISSING',
        });
      }
    }

    if (Object.keys(parameters).length > 20) {
      warnings.push({
        field: 'parameters',
        message: 'Too many parameters',
        code: 'TOO_MANY_PARAMETERS',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
