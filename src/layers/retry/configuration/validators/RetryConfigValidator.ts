/**
 * Retry Configuration Validator
 *
 * Validates retry configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { RetryBuilderConfig } from '../builders/RetryConfigBuilder';
import { RetryValidationService } from '../../domain/services/RetryValidationService';

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationError[];
  warnings: ConfigValidationWarning[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ConfigValidationWarning {
  path: string;
  message: string;
  code: string;
}

export class RetryConfigValidator {
  private readonly _validationService: RetryValidationService;

  constructor() {
    this._validationService = new RetryValidationService();
  }

  /**
   * Validate retry configuration
   */
  validate(config: RetryBuilderConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.retryPolicy) {
      errors.push({
        path: 'retryPolicy',
        message: 'Retry policy is required',
        code: 'RETRY_POLICY_REQUIRED',
      });
    } else {
      const policyValidation = this._validationService.validateRetryPolicy(config.retryPolicy);
      errors.push(
        ...policyValidation.errors.map((e: any) => ({
          path: `retryPolicy.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...policyValidation.warnings.map((w: any) => ({
          path: `retryPolicy.${w.field}`,
          message: w.message,
          code: w.code,
        })),
      );
    }

    if (!config.retryCondition) {
      errors.push({
        path: 'retryCondition',
        message: 'Retry condition is required',
        code: 'RETRY_CONDITION_REQUIRED',
      });
    } else {
      const conditionValidation = this._validationService.validateRetryCondition(config.retryCondition);
      errors.push(
        ...conditionValidation.errors.map((e: any) => ({
          path: `retryCondition.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...conditionValidation.warnings.map((w: any) => ({
          path: `retryCondition.${w.field}`,
          message: w.message,
          code: w.code,
        })),
      );
    }

    if (config.enableMetrics === undefined) {
      warnings.push({
        path: 'enableMetrics',
        message: 'Enable metrics not specified, will use default',
        code: 'MISSING_ENABLE_METRICS',
      });
    }

    if (config.enableLogging === undefined) {
      warnings.push({
        path: 'enableLogging',
        message: 'Enable logging not specified, will use default',
        code: 'MISSING_ENABLE_LOGGING',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate configuration for production use
   */
  validateForProduction(config: RetryBuilderConfig): ConfigValidationResult {
    const baseValidation = this.validate(config);
    const errors: ConfigValidationError[] = [...baseValidation.errors];
    const warnings: ConfigValidationWarning[] = [...baseValidation.warnings];

    if (!config.enableMetrics) {
      errors.push({
        path: 'enableMetrics',
        message: 'Metrics must be enabled in production',
        code: 'METRICS_REQUIRED_IN_PRODUCTION',
      });
    }

    if (!config.enableLogging) {
      errors.push({
        path: 'enableLogging',
        message: 'Logging must be enabled in production',
        code: 'LOGGING_REQUIRED_IN_PRODUCTION',
      });
    }

    if (!config.name) {
      warnings.push({
        path: 'name',
        message: 'Configuration name should be set in production for better observability',
        code: 'NAME_RECOMMENDED_IN_PRODUCTION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
