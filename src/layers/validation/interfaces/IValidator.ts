/**
 * Validator Interface
 * 
 * Defines the contract for validation operations
 * including schema validation, sanitization, and type checking.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ValidationResult,
  ValidationSchema,
  SanitizationResult,
  ExtendedValidationResult,
  ValidationContext,
  CrossFieldRule,
  ConditionalRule,
  ValidationHealthStatus,
  ValidationDiagnostics,
  ValidationStatistics,
  ValidationConfig,
  FieldValidation,
  Sanitizer,
  ValidationErrorCode,
  ValidationWarningCode,
  ValidationSeverity,
  FieldType,
} from '../types/validation-types';

/**
 * Interface for validation operations
 */
export interface IValidator {
  /**
   * Validates request data against a schema
   * 
   * @param request - HTTP request to validate
   * @param schema - Validation schema
   * @returns Validation result with errors and warnings
   */
  validate(request: HttpRequest, schema: ValidationSchema): ValidationResult;

  /**
   * Validates request data with extended result
   * 
   * @param request - HTTP request to validate
   * @param schema - Validation schema
   * @param context - Validation context
   * @returns Extended validation result with metrics
   */
  validateExtended(request: HttpRequest, schema: ValidationSchema, context?: ValidationContext): ExtendedValidationResult;

  /**
   * Sanitizes request data
   * 
   * @param request - HTTP request to sanitize
   * @returns Sanitization result with sanitized data
   */
  sanitize(request: HttpRequest): SanitizationResult;

  /**
   * Sanitizes a single field value
   * 
   * @param field - Field name
   * @param value - Field value
   * @param sanitizers - Sanitizers to apply
   * @returns Sanitized value
   */
  sanitizeField(field: string, value: unknown, sanitizers: Sanitizer[]): unknown;

  /**
   * Checks type of a value
   * 
   * @param value - Value to check
   * @param expectedType - Expected type
   * @returns True if type matches, false otherwise
   */
  checkType(value: unknown, expectedType: string): boolean;

  /**
   * Validates a single field value
   * 
   * @param field - Field name
   * @param value - Field value
   * @param rules - Validation rules
   * @param context - Validation context
   * @returns True if valid, false otherwise
   */
  validateField(field: string, value: unknown, rules: FieldValidation, context?: ValidationContext): boolean;

  /**
   * Validates a nested schema
   * 
   * @param data - Data to validate
   * @param schema - Nested validation schema
   * @param path - Current validation path
   * @param context - Validation context
   * @returns Validation result
   */
  validateNestedSchema(data: unknown, schema: ValidationSchema, path: string, context?: ValidationContext): ValidationResult;

  /**
   * Validates cross-field rules
   * 
   * @param data - Data to validate
   * @param rules - Cross-field rules
   * @param context - Validation context
   * @returns Validation result
   */
  validateCrossFieldRules(data: Record<string, unknown>, rules: CrossFieldRule[], context?: ValidationContext): ValidationResult;

  /**
   * Validates conditional rules
   * 
   * @param data - Data to validate
   * @param rules - Conditional rules
   * @param context - Validation context
   * @returns Validation result
   */
  validateConditionalRules(data: Record<string, unknown>, rules: ConditionalRule[], context?: ValidationContext): ValidationResult;

  /**
   * Sets default validation schema
   * 
   * @param schema - Default validation schema
   */
  setDefaultSchema(schema: ValidationSchema): void;

  /**
   * Gets the default validation schema
   * 
   * @returns Current default validation schema
   */
  getDefaultSchema(): ValidationSchema;

  /**
   * Sets validation configuration
   * 
   * @param config - Validation configuration
   */
  setValidationConfig(config: ValidationConfig): void;

  /**
   * Gets validation configuration
   * 
   * @returns Current validation configuration
   */
  getValidationConfig(): ValidationConfig;

  /**
   * Adds a cross-field rule
   * 
   * @param rule - Cross-field rule to add
   */
  addCrossFieldRule(rule: CrossFieldRule): void;

  /**
   * Removes a cross-field rule
   * 
   * @param ruleId - Rule ID to remove
   */
  removeCrossFieldRule(ruleId: string): void;

  /**
   * Gets all cross-field rules
   * 
   * @returns Array of cross-field rules
   */
  getCrossFieldRules(): CrossFieldRule[];

  /**
   * Adds a conditional rule
   * 
   * @param rule - Conditional rule to add
   */
  addConditionalRule(rule: ConditionalRule): void;

  /**
   * Removes a conditional rule
   * 
   * @param ruleId - Rule ID to remove
   */
  removeConditionalRule(ruleId: string): void;

  /**
   * Gets all conditional rules
   * 
   * @returns Array of conditional rules
   */
  getConditionalRules(): ConditionalRule[];

  /**
   * Gets validation health status
   * 
   * @returns Health status of validation system
   */
  getHealthStatus(): ValidationHealthStatus;

  /**
   * Runs validation diagnostics
   * 
   * @returns Diagnostics result
   */
  runDiagnostics(): ValidationDiagnostics;

  /**
   * Gets validation statistics
   * 
   * @returns Validation statistics
   */
  getStatistics(): ValidationStatistics;

  /**
   * Resets validation statistics
   */
  resetStatistics(): void;

  /**
   * Validates UUID format
   * 
   * @param value - Value to validate
   * @returns True if valid UUID, false otherwise
   */
  isValidUUID(value: unknown): boolean;

  /**
   * Validates phone number format
   * 
   * @param value - Value to validate
   * @returns True if valid phone number, false otherwise
   */
  isValidPhone(value: unknown): boolean;

  /**
   * Validates credit card format
   * 
   * @param value - Value to validate
   * @returns True if valid credit card, false otherwise
   */
  isValidCreditCard(value: unknown): boolean;

  /**
   * Validates IP address format
   * 
   * @param value - Value to validate
   * @returns True if valid IP address, false otherwise
   */
  isValidIPAddress(value: unknown): boolean;

  /**
   * Validates hex color format
   * 
   * @param value - Value to validate
   * @returns True if valid hex color, false otherwise
   */
  isValidHexColor(value: unknown): boolean;

  /**
   * Validates Base64 format
   * 
   * @param value - Value to validate
   * @returns True if valid Base64, false otherwise
   */
  isValidBase64(value: unknown): boolean;

  /**
   * Validates JSON format
   * 
   * @param value - Value to validate
   * @returns True if valid JSON, false otherwise
   */
  isValidJSON(value: unknown): boolean;

  /**
   * Validates XML format
   * 
   * @param value - Value to validate
   * @returns True if valid XML, false otherwise
   */
  isValidXML(value: unknown): boolean;

  /**
   * Adds a custom validator
   * 
   * @param name - Validator name
   * @param validator - Validator function
   */
  addCustomValidator(name: string, validator: (value: unknown, context: ValidationContext) => boolean): void;

  /**
   * Removes a custom validator
   * 
   * @param name - Validator name
   */
  removeCustomValidator(name: string): void;

  /**
   * Gets error message by error code
   * 
   * @param code - Error code
   * @param field - Field name
   * @returns Error message
   */
  getErrorMessage(code: ValidationErrorCode, field: string): string;

  /**
   * Gets warning message by warning code
   * 
   * @param code - Warning code
   * @param field - Field name
   * @returns Warning message
   */
  getWarningMessage(code: ValidationWarningCode, field: string): string;

  /**
   * Creates validation context
   * 
   * @param request - HTTP request
   * @returns Validation context
   */
  createValidationContext(request: HttpRequest): ValidationContext;

  /**
   * Validates array length
   * 
   * @param value - Array to validate
   * @param minLength - Minimum length
   * @param maxLength - Maximum length
   * @returns True if valid length, false otherwise
   */
  validateArrayLength(value: unknown, minLength?: number, maxLength?: number): boolean;

  /**
   * Validates object keys
   * 
   * @param value - Object to validate
   * @param requiredKeys - Required keys
   * @param allowedKeys - Allowed keys
   * @returns True if valid keys, false otherwise
   */
  validateObjectKeys(value: unknown, requiredKeys?: string[], allowedKeys?: string[]): boolean;

  /**
   * Applies sanitizers to value
   * 
   * @param value - Value to sanitize
   * @param sanitizers - Sanitizers to apply
   * @returns Sanitized value
   */
  applySanitizers(value: unknown, sanitizers: Sanitizer[]): unknown;
}
