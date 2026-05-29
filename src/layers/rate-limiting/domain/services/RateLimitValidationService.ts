/**
 * Rate Limit Validation Service
 *
 * Domain service for validating rate limit operations and configurations.
 * Provides validation logic for rate limits, rules, and requests.
 */

import { RateLimitConfig } from '../value-objects/RateLimitConfig';
import { RateLimitRule } from '../value-objects/RateLimitRule';
import { RateLimitRequestEntity } from '../entities/RateLimitRequest';

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

export class RateLimitValidationService {
  /**
   * Validate rate limit configuration
   */
  validateRateLimitConfig(config: RateLimitConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (config.getLimit() < 1) {
      errors.push({
        field: 'limit',
        message: 'Limit must be at least 1',
        code: 'INVALID_LIMIT',
      });
    }

    if (config.getWindow() < 1) {
      errors.push({
        field: 'window',
        message: 'Window must be at least 1',
        code: 'INVALID_WINDOW',
      });
    }

    if (config.getBurstLimit() < config.getLimit()) {
      errors.push({
        field: 'burstLimit',
        message: 'Burst limit must be greater than or equal to limit',
        code: 'INVALID_BURST_LIMIT',
      });
    }

    if (config.getLimit() > 10000) {
      warnings.push({
        field: 'limit',
        message: 'Very high limit may impact performance',
        code: 'HIGH_LIMIT',
      });
    }

    if (config.getWindowInMilliseconds() > 3600000) {
      warnings.push({
        field: 'window',
        message: 'Window is very long',
        code: 'LONG_WINDOW',
      });
    }

    if (!config.isDistributed() && config.getAlgorithm() === 'distributed') {
      errors.push({
        field: 'distributed',
        message: 'Distributed algorithm requires distributed mode',
        code: 'DISTRIBUTION_REQUIRED',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate rate limit rule
   */
  validateRateLimitRule(rule: RateLimitRule): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!rule.getClientId() || rule.getClientId().trim().length === 0) {
      errors.push({
        field: 'clientId',
        message: 'Client ID is required',
        code: 'CLIENT_ID_REQUIRED',
      });
    }

    if (!rule.getResource() || rule.getResource().trim().length === 0) {
      errors.push({
        field: 'resource',
        message: 'Resource is required',
        code: 'RESOURCE_REQUIRED',
      });
    }

    if (rule.getPriority() < 0) {
      errors.push({
        field: 'priority',
        message: 'Priority must be non-negative',
        code: 'INVALID_PRIORITY',
      });
    }

    if (!rule.isEnabled()) {
      warnings.push({
        field: 'enabled',
        message: 'Rule is disabled',
        code: 'RULE_DISABLED',
      });
    }

    if (rule.getConfig().limit < 1) {
      errors.push({
        field: 'config.limit',
        message: 'Config limit must be at least 1',
        code: 'INVALID_CONFIG_LIMIT',
      });
    }

    if (rule.getConditions().length > 10) {
      warnings.push({
        field: 'conditions',
        message: 'Too many conditions',
        code: 'TOO_MANY_CONDITIONS',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate rate limit request
   */
  validateRateLimitRequest(request: RateLimitRequestEntity): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!request.requestId || request.requestId.trim().length === 0) {
      errors.push({
        field: 'requestId',
        message: 'Request ID is required',
        code: 'REQUEST_ID_REQUIRED',
      });
    }

    if (!request.clientId || request.clientId.trim().length === 0) {
      errors.push({
        field: 'clientId',
        message: 'Client ID is required',
        code: 'CLIENT_ID_REQUIRED',
      });
    }

    if (!request.resource || request.resource.trim().length === 0) {
      errors.push({
        field: 'resource',
        message: 'Resource is required',
        code: 'RESOURCE_REQUIRED',
      });
    }

    if (request.getDuration() < 0) {
      errors.push({
        field: 'duration',
        message: 'Duration cannot be negative',
        code: 'INVALID_DURATION',
      });
    }

    if (request.getTimestamp() <= 0) {
      errors.push({
        field: 'timestamp',
        message: 'Timestamp must be positive',
        code: 'INVALID_TIMESTAMP',
      });
    }

    if (request.isDenied() && !request.reason) {
      warnings.push({
        field: 'reason',
        message: 'Request is denied but has no reason',
        code: 'DENIED_REQUEST_NO_REASON',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
