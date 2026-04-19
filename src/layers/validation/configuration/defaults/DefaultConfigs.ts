/**
 * Default Validation Configurations
 * 
 * Pre-configured settings for common validation scenarios.
 */

export interface ValidationConfigOptions {
  enableStrictMode: boolean;
  stopOnFirstError: boolean;
  returnAllErrors: boolean;
  enableAutoTrim: boolean;
  enableTypeCoercion: boolean;
  maxDepth: number;
  maxErrors: number;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: ValidationConfigOptions = {
    enableStrictMode: false,
    stopOnFirstError: false,
    returnAllErrors: true,
    enableAutoTrim: true,
    enableTypeCoercion: false,
    maxDepth: 10,
    maxErrors: 100,
  };

  /**
   * Strict configuration for high-security scenarios
   */
  static STRICT: ValidationConfigOptions = {
    enableStrictMode: true,
    stopOnFirstError: false,
    returnAllErrors: true,
    enableAutoTrim: false,
    enableTypeCoercion: false,
    maxDepth: 5,
    maxErrors: 50,
  };

  /**
   * Lenient configuration for development
   */
  static LENIENT: ValidationConfigOptions = {
    enableStrictMode: false,
    stopOnFirstError: true,
    returnAllErrors: false,
    enableAutoTrim: true,
    enableTypeCoercion: true,
    maxDepth: 20,
    maxErrors: 10,
  };

  /**
   * API-specific configuration
   */
  static API: ValidationConfigOptions = {
    enableStrictMode: true,
    stopOnFirstError: false,
    returnAllErrors: true,
    enableAutoTrim: true,
    enableTypeCoercion: false,
    maxDepth: 10,
    maxErrors: 100,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<ValidationConfigOptions>): ValidationConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as ValidationConfigOptions;
  }
}
