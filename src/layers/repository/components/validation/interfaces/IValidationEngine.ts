/**
 * Validation Engine Interface
 * 
 * Defines the contract for data validation and business rules.
 */

import {
  ValidationRule,
  ValidationResult,
  ValidationContext,
  ValidationConfig,
  ValidationStats,
  SchemaDefinition,
  FieldDefinition,
} from '../types/validation-types';

/**
 * Interface for validation engine operations
 */
export interface IValidationEngine {
  /**
   * Validates an entity against rules
   * 
   * @param entity - Entity to validate
   * @param rules - Validation rules to apply
   * @returns Validation result
   */
  validate(entity: Record<string, unknown>, rules: ValidationRule[]): ValidationResult;

  /**
   * Validates a single field
   * 
   * @param value - Value to validate
   * @param rule - Validation rule to apply
   * @param context - Validation context
   * @returns Validation result
   */
  validateField(value: unknown, rule: ValidationRule, context?: ValidationContext): ValidationResult;

  /**
   * Validates an entity against a schema
   * 
   * @param entity - Entity to validate
   * @param schema - Schema definition
   * @returns Validation result
   */
  validateSchema(entity: Record<string, unknown>, schema: SchemaDefinition): ValidationResult;

  /**
   * Registers a custom validator
   * 
   * @param name - Validator name
   * @param validator - Validator function
   */
  registerValidator(name: string, validator: (value: unknown) => boolean): void;

  /**
   * Unregisters a custom validator
   * 
   * @param name - Validator name
   */
  unregisterValidator(name: string): void;

  /**
   * Gets a custom validator
   * 
   * @param name - Validator name
   * @returns Validator function or undefined
   */
  getValidator(name: string): ((value: unknown) => boolean) | undefined;

  /**
   * Adds a validation rule
   * 
   * @param rule - Validation rule to add
   */
  addRule(rule: ValidationRule): void;

  /**
   * Removes a validation rule
   * 
   * @param ruleName - Rule name to remove
   */
  removeRule(ruleName: string): void;

  /**
   * Gets all validation rules
   * 
   * @returns Array of validation rules
   */
  getRules(): ValidationRule[];

  /**
   * Gets rules for a specific field
   * 
   * @param field - Field name
   * @returns Array of validation rules for the field
   */
  getRulesForField(field: string): ValidationRule[];

  /**
   * Sets validation configuration
   * 
   * @param config - Validation configuration
   */
  setConfig(config: Partial<ValidationConfig>): void;

  /**
   * Gets current validation configuration
   * 
   * @returns Current validation configuration
   */
  getConfig(): ValidationConfig;

  /**
   * Gets validation statistics
   * 
   * @returns Validation statistics
   */
  getStats(): ValidationStats;

  /**
   * Resets validation statistics
   */
  resetStats(): void;

  /**
   * Creates a validation context
   * 
   * @param fieldName - Field name
   * @param entity - Entity being validated
   * @param metadata - Optional metadata
   * @returns Validation context
   */
  createContext(fieldName: string, entity: Record<string, unknown>, metadata?: Record<string, unknown>): ValidationContext;

  /**
   * Validates required fields
   * 
   * @param entity - Entity to validate
   * @param requiredFields - Array of required field names
   * @returns Validation result
   */
  validateRequired(entity: Record<string, unknown>, requiredFields: string[]): ValidationResult;

  /**
   * Validates field types
   * 
   * @param entity - Entity to validate
   * @param fieldTypes - Map of field names to expected types
   * @returns Validation result
   */
  validateTypes(entity: Record<string, unknown>, fieldTypes: Map<string, string>): ValidationResult;

  /**
   * Clears all validation rules
   */
  clearRules(): void;

  /**
   * Clears all custom validators
   */
  clearValidators(): void;

  /**
   * Resets validation engine to default state
   */
  reset(): void;
}
