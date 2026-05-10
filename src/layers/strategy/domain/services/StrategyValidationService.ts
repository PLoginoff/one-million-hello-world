/**
 * Strategy Validation Service
 * 
 * Domain service for validating strategy operations and configurations.
 * Provides validation logic for strategies, feature flags, and executions.
 */

import { StrategyConfig } from '../value-objects/StrategyConfig';
import { FeatureFlag } from '../value-objects/FeatureFlag';
import { StrategyExecutionEntity } from '../entities/StrategyExecution';

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

export class StrategyValidationService {
  /**
   * Validate strategy configuration
   */
  validateStrategyConfig(config: StrategyConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!config.getName() || config.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Strategy name is required',
        code: 'STRATEGY_NAME_REQUIRED',
      });
    }

    if (config.getPriority() < 0) {
      errors.push({
        field: 'priority',
        message: 'Priority must be non-negative',
        code: 'INVALID_PRIORITY',
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
        message: 'Strategy is disabled',
        code: 'STRATEGY_DISABLED',
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
   * Validate feature flag
   */
  validateFeatureFlag(flag: FeatureFlag): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!flag.getName() || flag.getName().trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Flag name is required',
        code: 'FLAG_NAME_REQUIRED',
      });
    }

    if (flag.getRolloutPercentage() < 0 || flag.getRolloutPercentage() > 100) {
      errors.push({
        field: 'rolloutPercentage',
        message: 'Rollout percentage must be between 0 and 100',
        code: 'INVALID_ROLLOUT_PERCENTAGE',
      });
    }

    if (flag.getRolloutPercentage() > 0 && !flag.isEnabled()) {
      errors.push({
        field: 'enabled',
        message: 'Flag must be enabled to have rollout percentage',
        code: 'FLAG_MUST_BE_ENABLED',
      });
    }

    if (flag.getConditions().length === 0 && flag.getTargetAudience().length === 0 && flag.getRolloutPercentage() === 0) {
      warnings.push({
        field: 'conditions',
        message: 'Flag has no conditions, audience, or rollout',
        code: 'FLAG_HAS_NO_TARGETING',
      });
    }

    if (flag.getRolloutPercentage() === 100 && flag.isEnabled()) {
      warnings.push({
        field: 'rolloutPercentage',
        message: 'Flag is fully rolled out, consider removing conditions',
        code: 'FLAG_FULLY_ROLLED_OUT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate strategy execution
   */
  validateStrategyExecution(execution: StrategyExecutionEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!execution.strategyId || execution.strategyId.trim().length === 0) {
      errors.push({
        field: 'strategyId',
        message: 'Strategy ID is required',
        code: 'STRATEGY_ID_REQUIRED',
      });
    }

    if (!execution.executionId || execution.executionId.trim().length === 0) {
      errors.push({
        field: 'executionId',
        message: 'Execution ID is required',
        code: 'EXECUTION_ID_REQUIRED',
      });
    }

    if (execution.getDuration() < 0) {
      errors.push({
        field: 'duration',
        message: 'Duration cannot be negative',
        code: 'INVALID_DURATION',
      });
    }

    if (execution.getStartTime() <= 0) {
      errors.push({
        field: 'startTime',
        message: 'Start time must be positive',
        code: 'INVALID_START_TIME',
      });
    }

    if (execution.isFailed() && !execution.metadata.hasError()) {
      warnings.push({
        field: 'status',
        message: 'Execution is failed but has no error message',
        code: 'FAILED_EXECUTION_NO_ERROR',
      });
    }

    if (execution.isCompleted() && execution.result === undefined) {
      warnings.push({
        field: 'result',
        message: 'Execution is completed but has no result',
        code: 'COMPLETED_EXECUTION_NO_RESULT',
      });
    }

    if (execution.metadata.getRetryCount() > 3) {
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
   * Validate strategy parameters
   */
  validateStrategyParameters(parameters: Record<string, unknown>, requiredParams: string[]): ValidationResult {
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
