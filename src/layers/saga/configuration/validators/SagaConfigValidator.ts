/**
 * Saga Configuration Validator
 *
 * Validates saga configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { SagaBuilderConfig } from '../builders/SagaConfigBuilder';
import { SagaValidationService } from '../../domain/services/SagaValidationService';

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

export class SagaConfigValidator {
  private readonly _validationService: SagaValidationService;

  constructor() {
    this._validationService = new SagaValidationService();
  }

  /**
   * Validate saga configuration
   */
  validate(config: SagaBuilderConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.sagaConfig) {
      errors.push({
        path: 'sagaConfig',
        message: 'Saga configuration is required',
        code: 'SAGA_CONFIG_REQUIRED',
      });
    } else {
      const configValidation = this._validationService.validateSagaConfig(config.sagaConfig);
      errors.push(
        ...configValidation.errors.map((e: any) => ({
          path: `sagaConfig.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...configValidation.warnings.map((w: any) => ({
          path: `sagaConfig.${w.field}`,
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

    if (config.enableTracing === undefined) {
      warnings.push({
        path: 'enableTracing',
        message: 'Enable tracing not specified, will use default',
        code: 'MISSING_ENABLE_TRACING',
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
  validateForProduction(config: SagaBuilderConfig): ConfigValidationResult {
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

    if (!config.enableTracing) {
      warnings.push({
        path: 'enableTracing',
        message: 'Tracing should be enabled in production for better observability',
        code: 'TRACING_RECOMMENDED_IN_PRODUCTION',
      });
    }

    if (!config.name) {
      warnings.push({
        path: 'name',
        message: 'Configuration name should be set in production for better observability',
        code: 'NAME_RECOMMENDED_IN_PRODUCTION',
      });
    }

    if (config.sagaConfig && config.sagaConfig.data.compensationStrategy === 'manual') {
      warnings.push({
        path: 'sagaConfig.compensationStrategy',
        message: 'Manual compensation in production may be risky',
        code: 'MANUAL_COMPENSATION_PRODUCTION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
