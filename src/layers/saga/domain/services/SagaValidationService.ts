/**
 * Saga Validation Service
 *
 * Domain service for validating saga operations and configurations.
 * Provides validation logic for saga configs, step definitions, and executions.
 */

import { SagaConfig } from '../value-objects/SagaConfig';
import { SagaStepDefinition } from '../value-objects/SagaStepDefinition';
import { SagaExecutionEntity } from '../entities/SagaExecution';

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

export class SagaValidationService {
  /**
   * Validate saga configuration
   */
  validateSagaConfig(config: SagaConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.getName() || config.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Name is required',
        code: 'NAME_REQUIRED',
      });
    }

    if (config.getTimeout() < 0) {
      errors.push({
        field: 'timeout',
        message: 'Timeout must be non-negative',
        code: 'INVALID_TIMEOUT',
      });
    }

    if (config.getTimeout() > 300000) {
      warnings.push({
        field: 'timeout',
        message: 'Timeout is very high',
        code: 'HIGH_TIMEOUT',
      });
    }

    if (config.getRetryPolicy().maxAttempts < 1) {
      errors.push({
        field: 'retryPolicy.maxAttempts',
        message: 'Max attempts must be at least 1',
        code: 'INVALID_MAX_ATTEMPTS',
      });
    }

    if (config.getRetryPolicy().maxAttempts > 10) {
      warnings.push({
        field: 'retryPolicy.maxAttempts',
        message: 'High retry count may impact performance',
        code: 'HIGH_RETRY_COUNT',
      });
    }

    if (!config.isMetricsEnabled()) {
      warnings.push({
        field: 'enableMetrics',
        message: 'Metrics should be enabled for better observability',
        code: 'METRICS_DISABLED',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate saga step definition
   */
  validateSagaStepDefinition(step: SagaStepDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!step.getStepId() || step.getStepId().trim().length === 0) {
      errors.push({
        field: 'stepId',
        message: 'Step ID is required',
        code: 'STEP_ID_REQUIRED',
      });
    }

    if (!step.getName() || step.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Step name is required',
        code: 'STEP_NAME_REQUIRED',
      });
    }

    if (!step.getAction() || step.getAction().trim().length === 0) {
      errors.push({
        field: 'action',
        message: 'Step action is required',
        code: 'ACTION_REQUIRED',
      });
    }

    if (step.getTimeout() < 0) {
      errors.push({
        field: 'timeout',
        message: 'Timeout must be non-negative',
        code: 'INVALID_TIMEOUT',
      });
    }

    if (step.getTimeout() > 60000) {
      warnings.push({
        field: 'timeout',
        message: 'Step timeout is very high',
        code: 'HIGH_STEP_TIMEOUT',
      });
    }

    if (step.isRequired() && !step.hasCompensation()) {
      warnings.push({
        field: 'compensationAction',
        message: 'Required step should have compensation action',
        code: 'REQUIRED_STEP_NO_COMPENSATION',
      });
    }

    if (step.isParallel() && step.isRequired()) {
      warnings.push({
        field: 'parallel',
        message: 'Parallel required steps may have consistency issues',
        code: 'PARALLEL_REQUIRED_STEP',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate saga execution
   */
  validateSagaExecution(execution: SagaExecutionEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!execution.executionId || execution.executionId.trim().length === 0) {
      errors.push({
        field: 'executionId',
        message: 'Execution ID is required',
        code: 'EXECUTION_ID_REQUIRED',
      });
    }

    if (!execution.sagaId || execution.sagaId.trim().length === 0) {
      errors.push({
        field: 'sagaId',
        message: 'Saga ID is required',
        code: 'SAGA_ID_REQUIRED',
      });
    }

    if (execution.steps.length === 0) {
      warnings.push({
        field: 'steps',
        message: 'Saga has no steps',
        code: 'NO_STEPS',
      });
    }

    if (execution.getDuration() < 0) {
      errors.push({
        field: 'duration',
        message: 'Duration cannot be negative',
        code: 'INVALID_DURATION',
      });
    }

    if (execution.isFailed() && !execution.error) {
      warnings.push({
        field: 'error',
        message: 'Execution is failed but has no error',
        code: 'FAILED_EXECUTION_NO_ERROR',
      });
    }

    if (execution.isCompensating() && execution.compensationSteps.length === 0) {
      warnings.push({
        field: 'compensationSteps',
        message: 'Compensating execution has no compensation steps',
        code: 'COMPENSATING_NO_STEPS',
      });
    }

    if (execution.metadata.getAttemptCount() > 5) {
      warnings.push({
        field: 'attemptCount',
        message: 'High attempt count detected',
        code: 'HIGH_ATTEMPT_COUNT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
