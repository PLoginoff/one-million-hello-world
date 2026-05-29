/**
 * Circuit Breaker Configuration Validator
 * 
 * Validates circuit breaker configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { CircuitConfig } from '../builders/CircuitConfigBuilder';
import { CircuitValidationService } from '../../domain/services/CircuitValidationService';

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

export class CircuitConfigValidator {
  private readonly _validationService: CircuitValidationService;

  constructor() {
    this._validationService = new CircuitValidationService();
  }

  /**
   * Validate circuit configuration
   */
  validate(config: CircuitConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.threshold) {
      errors.push({
        path: 'threshold',
        message: 'Threshold is required',
        code: 'THRESHOLD_REQUIRED',
      });
    } else {
      const thresholdValidation = this._validationService.validateThreshold(config.threshold);
      errors.push(
        ...thresholdValidation.errors.map((e) => ({
          path: `threshold.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...thresholdValidation.warnings.map((w) => ({
          path: `threshold.${w.field}`,
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

    if (config.enableSlidingWindow === undefined) {
      warnings.push({
        path: 'enableSlidingWindow',
        message: 'Enable sliding window not specified, will use default',
        code: 'MISSING_ENABLE_SLIDING_WINDOW',
      });
    }

    if (config.slidingWindowSize === undefined) {
      warnings.push({
        path: 'slidingWindowSize',
        message: 'Sliding window size not specified, will use threshold value',
        code: 'MISSING_SLIDING_WINDOW_SIZE',
      });
    } else if (config.slidingWindowSize <= 0) {
      errors.push({
        path: 'slidingWindowSize',
        message: 'Sliding window size must be positive',
        code: 'INVALID_SLIDING_WINDOW_SIZE',
      });
    } else if (config.slidingWindowSize > 100000) {
      warnings.push({
        path: 'slidingWindowSize',
        message: 'Sliding window size is very large, may impact performance',
        code: 'LARGE_SLIDING_WINDOW_SIZE',
      });
    }

    if (config.slidingWindowSize && config.threshold) {
      if (config.slidingWindowSize < config.threshold.getMinimumRequests()) {
        warnings.push({
          path: 'slidingWindowSize',
          message: 'Sliding window size is smaller than minimum requests threshold',
          code: 'SLIDING_WINDOW_TOO_SMALL',
        });
      }
    }

    if (config.name && config.name.length > 100) {
      warnings.push({
        path: 'name',
        message: 'Circuit name is very long',
        code: 'LONG_CIRCUIT_NAME',
      });
    }

    if (config.tags && config.tags.length > 20) {
      warnings.push({
        path: 'tags',
        message: 'Too many tags, consider reducing',
        code: 'TOO_MANY_TAGS',
      });
    }

    if (config.tags) {
      const duplicateTags = this._findDuplicateTags(config.tags);
      if (duplicateTags.length > 0) {
        warnings.push({
          path: 'tags',
          message: `Duplicate tags found: ${duplicateTags.join(', ')}`,
          code: 'DUPLICATE_TAGS',
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
   * Validate configuration for production use
   */
  validateForProduction(config: CircuitConfig): ConfigValidationResult {
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
        message: 'Circuit name should be set in production for better observability',
        code: 'NAME_RECOMMENDED_IN_PRODUCTION',
      });
    }

    if (config.threshold && config.threshold.getFailureThreshold() < 5) {
      warnings.push({
        path: 'threshold.failureThreshold',
        message: 'Failure threshold is low for production, may cause frequent tripping',
        code: 'LOW_FAILURE_THRESHOLD_PRODUCTION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private _findDuplicateTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const tag of tags) {
      if (seen.has(tag)) {
        duplicates.push(tag);
      } else {
        seen.add(tag);
      }
    }

    return duplicates;
  }
}
