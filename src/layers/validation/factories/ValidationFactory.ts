/**
 * Validation Factory
 * 
 * Factory for creating validation components and configurations.
 */

import { ValidationConfigBuilder } from '../configuration/builders/ValidationConfigBuilder';
import { DefaultConfigs, ValidationConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { ValidationRuleEntity } from '../domain/entities/ValidationRuleEntity';
import { ValidationResultEntity } from '../domain/entities/ValidationResultEntity';
import { ValidationSeverityValueObject } from '../domain/value-objects/ValidationSeverityValueObject';
import { ValidationService } from '../domain/services/ValidationService';
import { SchemaValidationService, ValidationSchema } from '../domain/services/SchemaValidationService';
import { ValidationStatistics } from '../statistics/ValidationStatistics';
import { SchemaValidationStrategy } from '../strategies/strategy/SchemaValidationStrategy';
import { RuleBasedValidationStrategy } from '../strategies/strategy/RuleBasedValidationStrategy';
import { IValidationStrategy } from '../strategies/strategy/IValidationStrategy';

export class ValidationFactory {
  /**
   * Create default validation configuration
   */
  static createDefaultConfig(): ValidationConfigOptions {
    return ValidationConfigBuilder.create().build();
  }

  /**
   * Create strict validation configuration
   */
  static createStrictConfig(): ValidationConfigOptions {
    return ValidationConfigBuilder.strict().build();
  }

  /**
   * Create lenient validation configuration
   */
  static createLenientConfig(): ValidationConfigOptions {
    return ValidationConfigBuilder.lenient().build();
  }

  /**
   * Create API validation configuration
   */
  static createApiConfig(): ValidationConfigOptions {
    return ValidationConfigBuilder.api().build();
  }

  /**
   * Create custom validation configuration
   */
  static createCustomConfig(options: Partial<ValidationConfigOptions>): ValidationConfigOptions {
    return ValidationConfigBuilder.create()
      .withStrictMode(options.enableStrictMode ?? DefaultConfigs.DEFAULT.enableStrictMode)
      .withStopOnFirstError(options.stopOnFirstError ?? DefaultConfigs.DEFAULT.stopOnFirstError)
      .withReturnAllErrors(options.returnAllErrors ?? DefaultConfigs.DEFAULT.returnAllErrors)
      .withAutoTrim(options.enableAutoTrim ?? DefaultConfigs.DEFAULT.enableAutoTrim)
      .withTypeCoercion(options.enableTypeCoercion ?? DefaultConfigs.DEFAULT.enableTypeCoercion)
      .withMaxDepth(options.maxDepth ?? DefaultConfigs.DEFAULT.maxDepth)
      .withMaxErrors(options.maxErrors ?? DefaultConfigs.DEFAULT.maxErrors)
      .build();
  }

  /**
   * Create validation service
   */
  static createValidationService(): ValidationService {
    return new ValidationService();
  }

  /**
   * Create schema validation strategy
   */
  static createSchemaValidationStrategy(schema: ValidationSchema): SchemaValidationStrategy {
    return new SchemaValidationStrategy(schema);
  }

  /**
   * Create rule-based validation strategy
   */
  static createRuleBasedValidationStrategy(): RuleBasedValidationStrategy {
    return new RuleBasedValidationStrategy();
  }

  /**
   * Create validation statistics
   */
  static createValidationStatistics(): ValidationStatistics {
    return new ValidationStatistics();
  }

  /**
   * Create validation rule (string)
   */
  static createStringRule(
    id: string,
    name: string,
    required: boolean = false,
    minLength?: number,
    maxLength?: number
  ): ValidationRuleEntity {
    return ValidationRuleEntity.createStringRule(id, name, required, minLength, maxLength);
  }

  /**
   * Create validation rule (number)
   */
  static createNumberRule(
    id: string,
    name: string,
    required: boolean = false,
    min?: number,
    max?: number
  ): ValidationRuleEntity {
    return ValidationRuleEntity.createNumberRule(id, name, required, min, max);
  }

  /**
   * Create validation rule (pattern)
   */
  static createPatternRule(
    id: string,
    name: string,
    pattern: string,
    required: boolean = false
  ): ValidationRuleEntity {
    return ValidationRuleEntity.createPatternRule(id, name, pattern, required);
  }

  /**
   * Create custom validation rule
   */
  static createCustomRule(
    id: string,
    name: string,
    validator: (value: any) => boolean,
    required: boolean = false,
    errorMessage?: string
  ): ValidationRuleEntity {
    return ValidationRuleEntity.createCustomRule(id, name, validator, required, errorMessage);
  }

  /**
   * Create validation severity (info)
   */
  static createInfoSeverity(): ValidationSeverityValueObject {
    return ValidationSeverityValueObject.info();
  }

  /**
   * Create validation severity (warning)
   */
  static createWarningSeverity(): ValidationSeverityValueObject {
    return ValidationSeverityValueObject.warning();
  }

  /**
   * Create validation severity (error)
   */
  static createErrorSeverity(): ValidationSeverityValueObject {
    return ValidationSeverityValueObject.error();
  }

  /**
   * Create validation severity (critical)
   */
  static createCriticalSeverity(): ValidationSeverityValueObject {
    return ValidationSeverityValueObject.critical();
  }

  /**
   * Create successful validation result
   */
  static createSuccessResult(): ValidationResultEntity {
    return ValidationResultEntity.success();
  }

  /**
   * Create failed validation result
   */
  static createFailureResult(errors: Array<{ field: string; message: string }>): ValidationResultEntity {
    return ValidationResultEntity.failure(errors);
  }

  /**
   * Create complete validation stack with default configuration
   */
  static createDefaultStack(): {
    config: ValidationConfigOptions;
    strategy: IValidationStrategy;
    service: ValidationService;
    statistics: ValidationStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      strategy: this.createRuleBasedValidationStrategy(),
      service: this.createValidationService(),
      statistics: this.createValidationStatistics(),
    };
  }

  /**
   * Create strict validation stack
   */
  static createStrictStack(): {
    config: ValidationConfigOptions;
    strategy: IValidationStrategy;
    service: ValidationService;
    statistics: ValidationStatistics;
  } {
    return {
      config: this.createStrictConfig(),
      strategy: this.createSchemaValidationStrategy({}),
      service: this.createValidationService(),
      statistics: this.createValidationStatistics(),
    };
  }

  /**
   * Create API validation stack
   */
  static createApiStack(schema: ValidationSchema): {
    config: ValidationConfigOptions;
    strategy: IValidationStrategy;
    service: ValidationService;
    statistics: ValidationStatistics;
  } {
    return {
      config: this.createApiConfig(),
      strategy: this.createSchemaValidationStrategy(schema),
      service: this.createValidationService(),
      statistics: this.createValidationStatistics(),
    };
  }
}
