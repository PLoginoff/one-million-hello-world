/**
 * Strategy Configuration Validator
 *
 * Validates strategy configurations before use.
 * Ensures configurations are valid and safe to apply.
 */

import { StrategyBuilderConfig } from '../builders/StrategyConfigBuilder';
import { StrategyValidationService } from '../../domain/services/StrategyValidationService';

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

export class StrategyConfigValidator {
  private readonly _validationService: StrategyValidationService;

  constructor() {
    this._validationService = new StrategyValidationService();
  }

  /**
   * Validate strategy configuration
   */
  validate(config: StrategyBuilderConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: ConfigValidationWarning[] = [];

    if (!config.strategyConfig) {
      errors.push({
        path: 'strategyConfig',
        message: 'Strategy configuration is required',
        code: 'STRATEGY_CONFIG_REQUIRED',
      });
    } else {
      const configValidation = this._validationService.validateStrategyConfig(config.strategyConfig);
      errors.push(
        ...configValidation.errors.map((e: any) => ({
          path: `strategyConfig.${e.field}`,
          message: e.message,
          code: e.code,
        })),
      );
      warnings.push(
        ...configValidation.warnings.map((w: any) => ({
          path: `strategyConfig.${w.field}`,
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

    if (config.enableFeatureFlags === undefined) {
      warnings.push({
        path: 'enableFeatureFlags',
        message: 'Enable feature flags not specified, will use default',
        code: 'MISSING_ENABLE_FEATURE_FLAGS',
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
  validateForProduction(config: StrategyBuilderConfig): ConfigValidationResult {
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

    if (config.strategyConfig && config.strategyConfig.data.priority < 50) {
      warnings.push({
        path: 'strategyConfig.priority',
        message: 'Low priority strategy in production',
        code: 'LOW_PRIORITY_PRODUCTION',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
