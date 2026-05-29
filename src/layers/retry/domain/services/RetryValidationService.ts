/**
 * Retry Validation Service
 *
 * Domain service for validating retry operations and configurations.
 * Provides validation logic for retry policies, conditions, and attempts.
 */

import { RetryPolicy } from '../value-objects/RetryPolicy';
import { RetryCondition } from '../value-objects/RetryCondition';
import { RetryAttemptEntity } from '../entities/RetryAttempt';

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

export class RetryValidationService {
  /**
   * Validate retry policy
   */
  validateRetryPolicy(policy: RetryPolicy): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (policy.getMaxAttempts() < 1) {
      errors.push({
        field: 'maxAttempts',
        message: 'Max attempts must be at least 1',
        code: 'INVALID_MAX_ATTEMPTS',
      });
    }

    if (policy.getInitialDelay() < 0) {
      errors.push({
        field: 'initialDelay',
        message: 'Initial delay must be non-negative',
        code: 'INVALID_INITIAL_DELAY',
      });
    }

    if (policy.getMaxDelay() < policy.getInitialDelay()) {
      errors.push({
        field: 'maxDelay',
        message: 'Max delay must be greater than or equal to initial delay',
        code: 'INVALID_MAX_DELAY',
      });
    }

    if (policy.getMultiplier() < 1) {
      errors.push({
        field: 'multiplier',
        message: 'Multiplier must be at least 1',
        code: 'INVALID_MULTIPLIER',
      });
    }

    if (policy.getMaxAttempts() > 5) {
      warnings.push({
        field: 'maxAttempts',
        message: 'High retry count may impact performance',
        code: 'HIGH_RETRY_COUNT',
      });
    }

    if (policy.getMaxDelay() > 30000) {
      warnings.push({
        field: 'maxDelay',
        message: 'Max delay is very high',
        code: 'HIGH_MAX_DELAY',
      });
    }

    if (!policy.isJitterEnabled()) {
      warnings.push({
        field: 'jitterEnabled',
        message: 'Jitter is disabled, may cause thundering herd',
        code: 'JITTER_DISABLED',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate retry condition
   */
  validateRetryCondition(condition: RetryCondition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (condition.getMaxRetryableErrors() < -1) {
      errors.push({
        field: 'maxRetryableErrors',
        message: 'Max retryable errors must be -1 (unlimited) or non-negative',
        code: 'INVALID_MAX_RETRYABLE_ERRORS',
      });
    }

    const timeLimitForValidation = condition.getTimeLimit();
    if (timeLimitForValidation !== undefined && timeLimitForValidation < 0) {
      errors.push({
        field: 'timeLimit',
        message: 'Time limit must be non-negative',
        code: 'INVALID_TIME_LIMIT',
      });
    }

    if (condition.getRetryableErrors().length === 0 && condition.getRetryableStatusCodes().length === 0) {
      warnings.push({
        field: 'retryableErrors',
        message: 'No specific retryable errors defined, will retry all errors',
        code: 'ALL_ERRORS_RETRYABLE',
      });
    }

    const timeLimit = condition.getTimeLimit();
    if (timeLimit !== undefined && timeLimit > 120000) {
      warnings.push({
        field: 'timeLimit',
        message: 'Time limit is very high',
        code: 'HIGH_TIME_LIMIT',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate retry attempt
   */
  validateRetryAttempt(attempt: RetryAttemptEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!attempt.attemptId || attempt.attemptId.trim().length === 0) {
      errors.push({
        field: 'attemptId',
        message: 'Attempt ID is required',
        code: 'ATTEMPT_ID_REQUIRED',
      });
    }

    if (!attempt.retryId || attempt.retryId.trim().length === 0) {
      errors.push({
        field: 'retryId',
        message: 'Retry ID is required',
        code: 'RETRY_ID_REQUIRED',
      });
    }

    if (attempt.attemptNumber < 1) {
      errors.push({
        field: 'attemptNumber',
        message: 'Attempt number must be at least 1',
        code: 'INVALID_ATTEMPT_NUMBER',
      });
    }

    if (attempt.getDuration() < 0) {
      errors.push({
        field: 'duration',
        message: 'Duration cannot be negative',
        code: 'INVALID_DURATION',
      });
    }

    if (attempt.getStartTime() <= 0) {
      errors.push({
        field: 'startTime',
        message: 'Start time must be positive',
        code: 'INVALID_START_TIME',
      });
    }

    if (attempt.isFailed() && !attempt.metadata.hasError()) {
      warnings.push({
        field: 'status',
        message: 'Attempt is failed but has no error message',
        code: 'FAILED_ATTEMPT_NO_ERROR',
      });
    }

    if (attempt.isCompleted() && attempt.result === undefined) {
      warnings.push({
        field: 'result',
        message: 'Attempt is completed but has no result',
        code: 'COMPLETED_ATTEMPT_NO_RESULT',
      });
    }

    if (attempt.metadata.getRetryCount() > 3) {
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
}
