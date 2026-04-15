/**
 * Validation Layer Types
 * 
 * This module defines all type definitions for the Validation Layer,
 * including schema validation, sanitization, and type checking.
 */

/**
 * Validation error codes
 */
export enum ValidationErrorCode {
  REQUIRED = 'REQUIRED',
  INVALID_TYPE = 'INVALID_TYPE',
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_LENGTH = 'INVALID_LENGTH',
  INVALID_RANGE = 'INVALID_RANGE',
  INVALID_PATTERN = 'INVALID_PATTERN',
  INVALID_ENUM = 'INVALID_ENUM',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_URL = 'INVALID_URL',
  INVALID_DATE = 'INVALID_DATE',
  INVALID_UUID = 'INVALID_UUID',
  INVALID_PHONE = 'INVALID_PHONE',
  INVALID_CREDIT_CARD = 'INVALID_CREDIT_CARD',
  INVALID_IP_ADDRESS = 'INVALID_IP_ADDRESS',
  INVALID_HEX_COLOR = 'INVALID_HEX_COLOR',
  INVALID_BASE64 = 'INVALID_BASE64',
  INVALID_JSON = 'INVALID_JSON',
  INVALID_XML = 'INVALID_XML',
  INVALID_BOOLEAN_STRING = 'INVALID_BOOLEAN_STRING',
  INVALID_NUMBER_STRING = 'INVALID_NUMBER_STRING',
  INVALID_NULL_VALUE = 'INVALID_NULL_VALUE',
  INVALID_UNDEFINED_VALUE = 'INVALID_UNDEFINED_VALUE',
  INVALID_ARRAY_LENGTH = 'INVALID_ARRAY_LENGTH',
  INVALID_OBJECT_KEYS = 'INVALID_OBJECT_KEYS',
  INVALID_NESTED_SCHEMA = 'INVALID_NESTED_SCHEMA',
  CROSS_FIELD_VALIDATION = 'CROSS_FIELD_VALIDATION',
  CONDITIONAL_VALIDATION = 'CONDITIONAL_VALIDATION',
  ASYNC_VALIDATION = 'ASYNC_VALIDATION',
  CUSTOM = 'CUSTOM',
}

/**
 * Validation warning codes
 */
export enum ValidationWarningCode {
  DEPRECATED = 'DEPRECATED',
  FUTURE_VALUE = 'FUTURE_VALUE',
  PAST_VALUE = 'PAST_VALUE',
  UNUSUAL_VALUE = 'UNUSUAL_VALUE',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  DUPLICATE_VALUE = 'DUPLICATE_VALUE',
  SENSITIVE_DATA = 'SENSITIVE_DATA',
  LARGE_PAYLOAD = 'LARGE_PAYLOAD',
  MISSING_OPTIONAL_FIELD = 'MISSING_OPTIONAL_FIELD',
  TYPE_COERCION = 'TYPE_COERCION',
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
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metrics: ValidationMetrics;
}

/**
 * Extended validation result
 */
export interface ExtendedValidationResult extends ValidationResult {
  sanitizedData: unknown;
  validationTime: number;
  schemaVersion: string;
  validationContext: ValidationContext;
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  code: ValidationErrorCode;
  message: string;
  value?: unknown;
  severity: ValidationSeverity;
  path?: string;
  nestedErrors?: ValidationError[];
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  field: string;
  code: ValidationWarningCode;
  message: string;
  value?: unknown;
  severity: ValidationSeverity;
  path?: string;
}

/**
 * Validation metrics
 */
export interface ValidationMetrics {
  fieldsChecked: number;
  fieldsPassed: number;
  fieldsFailed: number;
  fieldsSkipped: number;
  validationDuration: number;
  sanitizationDuration: number;
  totalDuration: number;
  memoryUsage: number;
}

/**
 * Validation context
 */
export interface ValidationContext {
  requestId: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Validation schema
 */
export interface ValidationSchema {
  fields: Record<string, FieldValidation>;
  strictMode: boolean;
  sanitize: boolean;
  version: string;
  nestedSchemas?: Record<string, ValidationSchema>;
  crossFieldRules?: CrossFieldRule[];
  conditionalRules?: ConditionalRule[];
}

/**
 * Field validation rules
 */
export interface FieldValidation {
  required: boolean;
  type: FieldType;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: unknown[];
  min?: number;
  max?: number;
  email?: boolean;
  url?: boolean;
  date?: boolean;
  uuid?: boolean;
  phone?: boolean;
  creditCard?: boolean;
  ipAddress?: boolean;
  hexColor?: boolean;
  base64?: boolean;
  json?: boolean;
  xml?: boolean;
  booleanString?: boolean;
  numberString?: boolean;
  allowNull?: boolean;
  allowUndefined?: boolean;
  arrayMinLength?: number;
  arrayMaxLength?: number;
  objectRequiredKeys?: string[];
  objectAllowedKeys?: string[];
  nestedSchema?: ValidationSchema;
  customValidator?: (value: unknown, context: ValidationContext) => boolean;
  asyncValidator?: (value: unknown, context: ValidationContext) => Promise<boolean>;
  sanitizers?: Sanitizer[];
}

/**
 * Field types
 */
export enum FieldType {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  UUID = 'UUID',
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  URL = 'URL',
  CREDIT_CARD = 'CREDIT_CARD',
  IP_ADDRESS = 'IP_ADDRESS',
  HEX_COLOR = 'HEX_COLOR',
  BASE64 = 'BASE64',
  JSON = 'JSON',
  XML = 'XML',
  ANY = 'ANY',
}

/**
 * Sanitization result
 */
export interface SanitizationResult {
  sanitized: unknown;
  changed: boolean;
  removedFields: string[];
  modifiedFields: ModifiedField[];
  sanitizationMetrics: SanitizationMetrics;
}

/**
 * Modified field
 */
export interface ModifiedField {
  field: string;
  originalValue: unknown;
  sanitizedValue: unknown;
  sanitizer: string;
}

/**
 * Sanitization metrics
 */
export interface SanitizationMetrics {
  fieldsSanitized: number;
  fieldsRemoved: number;
  fieldsModified: number;
  sanitizationDuration: number;
}

/**
 * Sanitizer
 */
export interface Sanitizer {
  name: string;
  type: SanitizerType;
  options?: SanitizerOptions;
}

/**
 * Sanitizer types
 */
export enum SanitizerType {
  TRIM = 'TRIM',
  LOWERCASE = 'LOWERCASE',
  UPPERCASE = 'UPPERCASE',
  CAPITALIZE = 'CAPITALIZE',
  ESCAPE_HTML = 'ESCAPE_HTML',
  ESCAPE_REGEX = 'ESCAPE_REGEX',
  REMOVE_SCRIPTS = 'REMOVE_SCRIPTS',
  REMOVE_STYLES = 'REMOVE_STYLES',
  REMOVE_COMMENTS = 'REMOVE_COMMENTS',
  NORMALIZE_WHITESPACE = 'NORMALIZE_WHITESPACE',
  REMOVE_NULL_BYTES = 'REMOVE_NULL_BYTES',
  ENCODE_URI = 'ENCODE_URI',
  DECODE_URI = 'DECODE_URI',
  STRIP_TAGS = 'STRIP_TAGS',
  CUSTOM = 'CUSTOM',
}

/**
 * Sanitizer options
 */
export interface SanitizerOptions {
  preserveSpaces?: boolean;
  allowedTags?: string[];
  allowedAttributes?: string[];
  encoding?: string;
}

/**
 * Cross field rule
 */
export interface CrossFieldRule {
  id: string;
  name: string;
  fields: string[];
  validator: (values: Record<string, unknown>, context: ValidationContext) => boolean;
  errorMessage: string;
  enabled: boolean;
}

/**
 * Conditional rule
 */
export interface ConditionalRule {
  id: string;
  name: string;
  condition: (data: Record<string, unknown>, context: ValidationContext) => boolean;
  then: ValidationSchema;
  otherwise?: ValidationSchema;
  enabled: boolean;
}

/**
 * Validation health status
 */
export interface ValidationHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: ValidationHealthCheck[];
  lastCheck: Date;
}

/**
 * Validation health check
 */
export interface ValidationHealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  duration: number;
}

/**
 * Validation diagnostics
 */
export interface ValidationDiagnostics {
  traceId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
}

/**
 * Diagnostic step
 */
export interface DiagnosticStep {
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'success' | 'failure' | 'skipped';
  details: any;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  overallStatus: 'success' | 'partial' | 'failure';
}

/**
 * Validation statistics
 */
export interface ValidationStatistics {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  warningsGenerated: number;
  averageValidationTime: number;
  peakValidationTime: number;
  fieldsValidated: number;
  fieldsFailed: number;
  errorsByCode: Map<ValidationErrorCode, number>;
  warningsByCode: Map<ValidationWarningCode, number>;
  validationsByType: Map<FieldType, number>;
  lastResetTime: Date;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  strictMode: boolean;
  sanitize: boolean;
  enableAsyncValidation: boolean;
  enableCrossFieldValidation: boolean;
  enableConditionalValidation: boolean;
  maxValidationTime: number;
  enableDiagnostics: boolean;
  enableHealthChecks: boolean;
  enableStatistics: boolean;
}
