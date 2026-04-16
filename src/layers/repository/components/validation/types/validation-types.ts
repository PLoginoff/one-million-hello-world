/**
 * Validation Layer Types
 * 
 * Type definitions for data validation and business rules.
 */

/**
 * Validation rule
 */
export interface ValidationRule {
  name: string;
  field: string;
  validator: ValidatorFunction;
  errorMessage: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
}

/**
 * Validator function
 */
export type ValidatorFunction = (value: unknown, context: ValidationContext) => boolean;

/**
 * Validation context
 */
export interface ValidationContext {
  fieldName: string;
  entity: Record<string, unknown>;
  metadata: Record<string, unknown>;
  rules: ValidationRule[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  code: string;
  message: string;
  field: string;
  value: unknown;
  rule: string;
  severity: ValidationSeverity;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: string;
  message: string;
  field: string;
  value: unknown;
  rule: string;
}

/**
 * Validation severity
 */
export enum ValidationSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

/**
 * Validation category
 */
export enum ValidationCategory {
  REQUIRED = 'REQUIRED',
  FORMAT = 'FORMAT',
  LENGTH = 'LENGTH',
  RANGE = 'RANGE',
  PATTERN = 'PATTERN',
  CUSTOM = 'CUSTOM',
  BUSINESS = 'BUSINESS',
  REFERENCE = 'REFERENCE',
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  enabled: boolean;
  failFast: boolean;
  enableWarnings: boolean;
  customValidators: Map<string, ValidatorFunction>;
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  averageExecutionTime: number;
  ruleExecutionCounts: Map<string, number>;
}

/**
 * Schema definition
 */
export interface SchemaDefinition {
  fields: FieldDefinition[];
  globalRules: ValidationRule[];
}

/**
 * Field definition
 */
export interface FieldDefinition {
  name: string;
  type: FieldType;
  required: boolean;
  nullable: boolean;
  rules: ValidationRule[];
}

/**
 * Field type
 */
export enum FieldType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
}
