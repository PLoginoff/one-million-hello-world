/**
 * Facade Configuration Validator
 *
 * Validates facade configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { FacadeBuilderConfig } from '../builders/FacadeConfigBuilder';
import { FacadeValidationService } from '../../domain/services/FacadeValidationService';

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

export class FacadeConfigValidator {
  private readonly _validationService: FacadeValidationService;

  constructor() {
    this._validationService = new FacadeValidationService();
  }

  /**
   * Validate facade configuration
   */
  validate(config: FacadeBuilderConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.facadeConfig) {
      errors.push({
        path: 'facadeConfig',
        message: 'Facade configuration is required',
        code: 'FACADE_CONFIG_REQUIRED',
      });
    } else {
      const configValidation = this._validationService.validateFacadeConfig(config.facadeConfig);
      errors.push(
        ...configValidation.errors.map((e: any) => ({
          path: `facadeConfig.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...configValidation.warnings.map((w: any) => ({
          path: `facadeConfig.${w.field}`,
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
  validateForProduction(config: FacadeBuilderConfig): ConfigValidationResult {
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

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
