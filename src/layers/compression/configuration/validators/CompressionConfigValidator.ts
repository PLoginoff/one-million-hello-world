/**
 * Compression Configuration Validator
 * 
 * Validates compression configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { CompressionConfig } from '../builders/CompressionConfigBuilder';
import { CompressionValidationService } from '../../domain/services/CompressionValidationService';

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

export class CompressionConfigValidator {
  private readonly _validationService: CompressionValidationService;

  constructor() {
    this._validationService = new CompressionValidationService();
  }

  /**
   * Validate compression configuration
   */
  validate(config: CompressionConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.algorithm) {
      errors.push({
        path: 'algorithm',
        message: 'Algorithm is required',
        code: 'ALGORITHM_REQUIRED',
      });
    } else {
      const algorithmValidation = this._validationService.validateAlgorithm(config.algorithm);
      errors.push(
        ...algorithmValidation.errors.map((e) => ({
          path: `algorithm.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...algorithmValidation.warnings.map((w) => ({
          path: `algorithm.${w.field}`,
          message: w.message,
          code: w.code,
        })),
      );
    }

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

    if (config.defaultLevel === undefined) {
      warnings.push({
        path: 'defaultLevel',
        message: 'Default level not specified, will use algorithm default',
        code: 'MISSING_DEFAULT_LEVEL',
      });
    } else {
      if (config.defaultLevel < 0) {
        errors.push({
          path: 'defaultLevel',
          message: 'Default level must be non-negative',
          code: 'INVALID_DEFAULT_LEVEL',
        });
      }

      if (config.algorithm && !config.algorithm.isValidLevel(config.defaultLevel)) {
        errors.push({
          path: 'defaultLevel',
          message: 'Default level is not valid for the selected algorithm',
          code: 'INVALID_LEVEL_FOR_ALGORITHM',
        });
      }
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

    if (config.name && config.name.length > 100) {
      warnings.push({
        path: 'name',
        message: 'Configuration name is very long',
        code: 'LONG_CONFIG_NAME',
      });
    }

    if (config.tags && config.tags.length > 20) {
      warnings.push({
        path: 'tags',
        message: 'Too many tags, consider reducing',
        code: 'TOO_MANY_TAGS',
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
  validateForProduction(config: CompressionConfig): ConfigValidationResult {
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

    if (config.threshold && config.threshold.getMaxCompressionTime() > 1000) {
      warnings.push({
        path: 'threshold.maxCompressionTime',
        message: 'Compression time threshold is high for production',
        code: 'HIGH_COMPRESSION_TIME_PRODUCTION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
