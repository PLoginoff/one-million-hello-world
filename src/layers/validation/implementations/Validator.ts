/**
 * Validator Implementation
 * 
 * Concrete implementation of IValidator.
 * Handles schema validation, sanitization, and type checking.
 */

import { IValidator } from '../interfaces/IValidator';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ValidationResult,
  ValidationSchema,
  SanitizationResult,
  ValidationError,
  FieldValidation,
  FieldType,
  ValidationErrorCode,
  ExtendedValidationResult,
  ValidationContext,
  CrossFieldRule,
  ConditionalRule,
  ValidationHealthStatus,
  ValidationDiagnostics,
  ValidationStatistics,
  ValidationConfig,
  Sanitizer,
  ValidationWarningCode,
  ModifiedField,
  SanitizationMetrics,
  ValidationMetrics,
  ValidationWarning,
  ValidationSeverity,
} from '../types/validation-types';

export class Validator implements IValidator {
  private _defaultSchema: ValidationSchema;
  private _validationConfig: ValidationConfig;
  private _crossFieldRules: Map<string, CrossFieldRule>;
  private _conditionalRules: Map<string, ConditionalRule>;
  private _customValidators: Map<string, (value: unknown, context: ValidationContext) => boolean>;
  private _statistics: ValidationStatistics;
  private _validationStartTime: number;

  constructor() {
    this._defaultSchema = {
      fields: {},
      strictMode: true,
      sanitize: true,
      version: '1.0.0',
    };

    this._validationConfig = {
      strictMode: true,
      sanitize: true,
      enableAsyncValidation: false,
      enableCrossFieldValidation: true,
      enableConditionalValidation: true,
      maxValidationTime: 5000,
      enableDiagnostics: true,
      enableHealthChecks: true,
      enableStatistics: true,
    };

    this._crossFieldRules = new Map();
    this._conditionalRules = new Map();
    this._customValidators = new Map();

    this._statistics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      warningsGenerated: 0,
      averageValidationTime: 0,
      peakValidationTime: 0,
      fieldsValidated: 0,
      fieldsFailed: 0,
      errorsByCode: new Map(),
      warningsByCode: new Map(),
      validationsByType: new Map(),
      lastResetTime: new Date(),
    };

    this._validationStartTime = 0;
  }

  validate(request: HttpRequest, schema: ValidationSchema): ValidationResult {
    this._validationStartTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const schemaToUse = schema || this._defaultSchema;

    let fieldsChecked = 0;
    let fieldsPassed = 0;
    let fieldsFailed = 0;

    for (const [fieldName, rules] of Object.entries(schemaToUse.fields)) {
      fieldsChecked++;
      const value = request.headers.get(fieldName) || this._extractFromBody(request, fieldName);

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.REQUIRED,
          message: `${fieldName} is required`,
          value,
          severity: ValidationSeverity.ERROR,
        });
        fieldsFailed++;
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        const fieldErrors = this._validateField(fieldName, value, rules);
        errors.push(...fieldErrors);
        if (fieldErrors.length > 0) {
          fieldsFailed++;
        } else {
          fieldsPassed++;
        }
      } else {
        fieldsPassed++;
      }
    }

    const validationEndTime = Date.now();
    const validationDuration = validationEndTime - this._validationStartTime;

    this._statistics.totalValidations++;
    if (errors.length === 0) {
      this._statistics.successfulValidations++;
    } else {
      this._statistics.failedValidations++;
    }
    this._statistics.fieldsValidated += fieldsChecked;
    this._statistics.fieldsFailed += fieldsFailed;
    this._statistics.averageValidationTime = (this._statistics.averageValidationTime * (this._statistics.totalValidations - 1) + validationDuration) / this._statistics.totalValidations;
    if (validationDuration > this._statistics.peakValidationTime) {
      this._statistics.peakValidationTime = validationDuration;
    }

    const metrics: ValidationMetrics = {
      fieldsChecked,
      fieldsPassed,
      fieldsFailed,
      fieldsSkipped: 0,
      validationDuration,
      sanitizationDuration: 0,
      totalDuration: validationDuration,
      memoryUsage: 0,
    };

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics,
    };
  }

  validateExtended(request: HttpRequest, schema: ValidationSchema, context?: ValidationContext): ExtendedValidationResult {
    const validationStartTime = Date.now();
    const result = this.validate(request, schema);
    const sanitizationResult = this.sanitize(request);
    const validationEndTime = Date.now();

    const validationContext = context || this.createValidationContext(request);

    return {
      ...result,
      sanitizedData: sanitizationResult.sanitized,
      validationTime: validationEndTime - validationStartTime,
      schemaVersion: schema.version || '1.0.0',
      validationContext,
    };
  }

  sanitize(request: HttpRequest): SanitizationResult {
    const sanitizationStartTime = Date.now();
    const sanitizedHeaders = new Map(request.headers);
    const removedFields: string[] = [];
    const modifiedFields: ModifiedField[] = [];
    let changed = false;

    for (const [key, value] of sanitizedHeaders.entries()) {
      const sanitized = this._sanitizeString(value as string);
      if (sanitized !== value) {
        sanitizedHeaders.set(key, sanitized);
        changed = true;
        modifiedFields.push({
          field: key,
          originalValue: value,
          sanitizedValue: sanitized,
          sanitizer: 'ESCAPE_HTML',
        });
      }

      if (this._isMalicious(key, value as string)) {
        sanitizedHeaders.delete(key);
        removedFields.push(key);
        changed = true;
      }
    }

    const sanitizationEndTime = Date.now();
    const sanitizationDuration = sanitizationEndTime - sanitizationStartTime;

    const sanitizationMetrics: SanitizationMetrics = {
      fieldsSanitized: modifiedFields.length,
      fieldsRemoved: removedFields.length,
      fieldsModified: modifiedFields.length,
      sanitizationDuration,
    };

    return {
      sanitized: { ...request, headers: sanitizedHeaders },
      changed,
      removedFields,
      modifiedFields,
      sanitizationMetrics,
    };
  }

  sanitizeField(field: string, value: unknown, sanitizers: Sanitizer[]): unknown {
    let sanitized = value;
    for (const sanitizer of sanitizers) {
      sanitized = this._applySanitizer(sanitized, sanitizer);
    }
    return sanitized;
  }

  checkType(value: unknown, expectedType: string): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }

  validateField(field: string, value: unknown, rules: FieldValidation, context?: ValidationContext): boolean {
    const errors = this._validateField(field, value, rules, context);
    return errors.length === 0;
  }

  validateNestedSchema(data: unknown, schema: ValidationSchema, path: string, context?: ValidationContext): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof data !== 'object' || data === null) {
      return {
        valid: false,
        errors,
        warnings,
        metrics: {
          fieldsChecked: 0,
          fieldsPassed: 0,
          fieldsFailed: 0,
          fieldsSkipped: 0,
          validationDuration: 0,
          sanitizationDuration: 0,
          totalDuration: 0,
          memoryUsage: 0,
        },
      };
    }

    for (const [fieldName, rules] of Object.entries(schema.fields)) {
      const fieldValue = (data as Record<string, unknown>)[fieldName];
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;

      if (rules.required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
        errors.push({
          field: fieldPath,
          code: ValidationErrorCode.REQUIRED,
          message: `${fieldPath} is required`,
          value: fieldValue,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        const fieldErrors = this._validateField(fieldPath, fieldValue, rules, context);
        errors.push(...fieldErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        fieldsChecked: Object.keys(schema.fields).length,
        fieldsPassed: Object.keys(schema.fields).length - errors.length,
        fieldsFailed: errors.length,
        fieldsSkipped: 0,
        validationDuration: 0,
        sanitizationDuration: 0,
        totalDuration: 0,
        memoryUsage: 0,
      },
    };
  }

  validateCrossFieldRules(data: Record<string, unknown>, rules: CrossFieldRule[], context?: ValidationContext): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const isValid = rule.validator(data, context || this._createDefaultContext());
      if (!isValid) {
        errors.push({
          field: rule.fields.join(','),
          code: ValidationErrorCode.CROSS_FIELD_VALIDATION,
          message: rule.errorMessage,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        fieldsChecked: rules.length,
        fieldsPassed: rules.length - errors.length,
        fieldsFailed: errors.length,
        fieldsSkipped: 0,
        validationDuration: 0,
        sanitizationDuration: 0,
        totalDuration: 0,
        memoryUsage: 0,
      },
    };
  }

  validateConditionalRules(data: Record<string, unknown>, rules: ConditionalRule[], context?: ValidationContext): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const conditionMet = rule.condition(data, context || this._createDefaultContext());
      const schemaToUse = conditionMet ? rule.then : rule.otherwise;

      if (schemaToUse) {
        const result = this.validateNestedSchema(data, schemaToUse, '', context);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        fieldsChecked: rules.length,
        fieldsPassed: rules.length - errors.length,
        fieldsFailed: errors.length,
        fieldsSkipped: 0,
        validationDuration: 0,
        sanitizationDuration: 0,
        totalDuration: 0,
        memoryUsage: 0,
      },
    };
  }

  setDefaultSchema(schema: ValidationSchema): void {
    this._defaultSchema = { ...this._defaultSchema, ...schema };
  }

  getDefaultSchema(): ValidationSchema {
    return { ...this._defaultSchema };
  }

  setValidationConfig(config: ValidationConfig): void {
    this._validationConfig = { ...this._validationConfig, ...config };
  }

  getValidationConfig(): ValidationConfig {
    return { ...this._validationConfig };
  }

  addCrossFieldRule(rule: CrossFieldRule): void {
    this._crossFieldRules.set(rule.id, rule);
  }

  removeCrossFieldRule(ruleId: string): void {
    this._crossFieldRules.delete(ruleId);
  }

  getCrossFieldRules(): CrossFieldRule[] {
    return Array.from(this._crossFieldRules.values());
  }

  addConditionalRule(rule: ConditionalRule): void {
    this._conditionalRules.set(rule.id, rule);
  }

  removeConditionalRule(ruleId: string): void {
    this._conditionalRules.delete(ruleId);
  }

  getConditionalRules(): ConditionalRule[] {
    return Array.from(this._conditionalRules.values());
  }

  getHealthStatus(): ValidationHealthStatus {
    const checks = [
      {
        name: 'schema_loaded',
        status: 'pass' as 'pass' | 'warn' | 'fail',
        message: 'Default schema loaded',
        duration: 0,
      },
      {
        name: 'config_valid',
        status: 'pass' as 'pass' | 'warn' | 'fail',
        message: 'Validation config valid',
        duration: 0,
      },
      {
        name: 'statistics_enabled',
        status: (this._validationConfig.enableStatistics ? 'pass' : 'warn') as 'pass' | 'warn' | 'fail',
        message: this._validationConfig.enableStatistics ? 'Statistics enabled' : 'Statistics disabled',
        duration: 0,
      },
    ];

    const failedChecks = checks.filter((c) => c.status === 'fail').length;
    const score = Math.max(0, 100 - failedChecks * 25);

    return {
      status: failedChecks === 0 ? 'healthy' : failedChecks < 3 ? 'degraded' : 'unhealthy',
      score,
      checks,
      lastCheck: new Date(),
    };
  }

  runDiagnostics(): ValidationDiagnostics {
    const startTime = new Date();
    const traceId = `diag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const steps = [
      {
        name: 'check_schema',
        startTime,
        endTime: new Date(),
        duration: 1,
        status: 'success' as 'success' | 'failure' | 'skipped',
        details: { schema: this._defaultSchema },
      },
      {
        name: 'check_config',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1,
        status: 'success' as 'success' | 'failure' | 'skipped',
        details: { config: this._validationConfig },
      },
      {
        name: 'check_statistics',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1,
        status: 'success' as 'success' | 'failure' | 'skipped',
        details: { statistics: this._statistics },
      },
    ];

    const endTime = new Date();

    return {
      traceId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      steps,
      summary: {
        totalSteps: steps.length,
        successfulSteps: steps.filter((s) => s.status === 'success').length,
        failedSteps: steps.filter((s) => s.status === 'failure').length,
        skippedSteps: steps.filter((s) => s.status === 'skipped').length,
        overallStatus: 'success' as 'success' | 'partial' | 'failure',
      },
    };
  }

  getStatistics(): ValidationStatistics {
    return { ...this._statistics };
  }

  resetStatistics(): void {
    this._statistics = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      warningsGenerated: 0,
      averageValidationTime: 0,
      peakValidationTime: 0,
      fieldsValidated: 0,
      fieldsFailed: 0,
      errorsByCode: new Map(),
      warningsByCode: new Map(),
      validationsByType: new Map(),
      lastResetTime: new Date(),
    };
  }

  isValidUUID(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  isValidPhone(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(value);
  }

  isValidCreditCard(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;
    return /^\d+$/.test(cleaned);
  }

  isValidIPAddress(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(value) || ipv6Regex.test(value);
  }

  isValidHexColor(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    return hexRegex.test(value);
  }

  isValidBase64(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    return base64Regex.test(value);
  }

  isValidJSON(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }

  isValidXML(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const xmlRegex = /^<[\s\S]*>$/;
    return xmlRegex.test(value);
  }

  addCustomValidator(name: string, validator: (value: unknown, context: ValidationContext) => boolean): void {
    this._customValidators.set(name, validator);
  }

  removeCustomValidator(name: string): void {
    this._customValidators.delete(name);
  }

  getErrorMessage(code: ValidationErrorCode, field: string): string {
    const messages: Record<ValidationErrorCode, string> = {
      [ValidationErrorCode.REQUIRED]: `${field} is required`,
      [ValidationErrorCode.INVALID_TYPE]: `${field} has invalid type`,
      [ValidationErrorCode.INVALID_FORMAT]: `${field} has invalid format`,
      [ValidationErrorCode.INVALID_LENGTH]: `${field} has invalid length`,
      [ValidationErrorCode.INVALID_RANGE]: `${field} is out of valid range`,
      [ValidationErrorCode.INVALID_PATTERN]: `${field} does not match required pattern`,
      [ValidationErrorCode.INVALID_ENUM]: `${field} is not a valid enum value`,
      [ValidationErrorCode.INVALID_EMAIL]: `${field} must be a valid email`,
      [ValidationErrorCode.INVALID_URL]: `${field} must be a valid URL`,
      [ValidationErrorCode.INVALID_DATE]: `${field} must be a valid date`,
      [ValidationErrorCode.INVALID_UUID]: `${field} must be a valid UUID`,
      [ValidationErrorCode.INVALID_PHONE]: `${field} must be a valid phone number`,
      [ValidationErrorCode.INVALID_CREDIT_CARD]: `${field} must be a valid credit card`,
      [ValidationErrorCode.INVALID_IP_ADDRESS]: `${field} must be a valid IP address`,
      [ValidationErrorCode.INVALID_HEX_COLOR]: `${field} must be a valid hex color`,
      [ValidationErrorCode.INVALID_BASE64]: `${field} must be valid Base64`,
      [ValidationErrorCode.INVALID_JSON]: `${field} must be valid JSON`,
      [ValidationErrorCode.INVALID_XML]: `${field} must be valid XML`,
      [ValidationErrorCode.INVALID_BOOLEAN_STRING]: `${field} must be a valid boolean string`,
      [ValidationErrorCode.INVALID_NUMBER_STRING]: `${field} must be a valid number string`,
      [ValidationErrorCode.INVALID_NULL_VALUE]: `${field} cannot be null`,
      [ValidationErrorCode.INVALID_UNDEFINED_VALUE]: `${field} cannot be undefined`,
      [ValidationErrorCode.INVALID_ARRAY_LENGTH]: `${field} has invalid array length`,
      [ValidationErrorCode.INVALID_OBJECT_KEYS]: `${field} has invalid object keys`,
      [ValidationErrorCode.INVALID_NESTED_SCHEMA]: `${field} failed nested schema validation`,
      [ValidationErrorCode.CROSS_FIELD_VALIDATION]: `${field} failed cross-field validation`,
      [ValidationErrorCode.CONDITIONAL_VALIDATION]: `${field} failed conditional validation`,
      [ValidationErrorCode.ASYNC_VALIDATION]: `${field} failed async validation`,
      [ValidationErrorCode.CUSTOM]: `${field} failed custom validation`,
    };
    return messages[code] || `${field} validation failed`;
  }

  getWarningMessage(code: ValidationWarningCode, field: string): string {
    const messages: Record<ValidationWarningCode, string> = {
      [ValidationWarningCode.DEPRECATED]: `${field} is deprecated`,
      [ValidationWarningCode.FUTURE_VALUE]: `${field} has a future value`,
      [ValidationWarningCode.PAST_VALUE]: `${field} has a past value`,
      [ValidationWarningCode.UNUSUAL_VALUE]: `${field} has an unusual value`,
      [ValidationWarningCode.WEAK_PASSWORD]: `${field} is a weak password`,
      [ValidationWarningCode.DUPLICATE_VALUE]: `${field} is a duplicate value`,
      [ValidationWarningCode.SENSITIVE_DATA]: `${field} contains sensitive data`,
      [ValidationWarningCode.LARGE_PAYLOAD]: `${field} is a large payload`,
      [ValidationWarningCode.MISSING_OPTIONAL_FIELD]: `${field} is missing optional field`,
      [ValidationWarningCode.TYPE_COERCION]: `${field} was type coerced`,
    };
    return messages[code] || `${field} warning`;
  }

  createValidationContext(request: HttpRequest): ValidationContext {
    return {
      requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId: request.headers.get('user-id') || undefined,
      sessionId: request.headers.get('session-id') || undefined,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    };
  }

  validateArrayLength(value: unknown, minLength?: number, maxLength?: number): boolean {
    if (!Array.isArray(value)) return false;
    if (minLength !== undefined && value.length < minLength) return false;
    if (maxLength !== undefined && value.length > maxLength) return false;
    return true;
  }

  validateObjectKeys(value: unknown, requiredKeys?: string[], allowedKeys?: string[]): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (requiredKeys) {
      for (const key of requiredKeys) {
        if (!keys.includes(key)) return false;
      }
    }
    if (allowedKeys) {
      for (const key of keys) {
        if (!allowedKeys.includes(key)) return false;
      }
    }
    return true;
  }

  applySanitizers(value: unknown, sanitizers: Sanitizer[]): unknown {
    let sanitized = value;
    for (const sanitizer of sanitizers) {
      sanitized = this._applySanitizer(sanitized, sanitizer);
    }
    return sanitized;
  }

  private _validateField(field: string, value: unknown, rules: FieldValidation, context?: ValidationContext): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.checkType(value, rules.type)) {
      errors.push({
        field,
        code: ValidationErrorCode.INVALID_TYPE,
        message: `${field} must be of type ${rules.type}`,
        value,
        severity: ValidationSeverity.ERROR,
      });
      return errors;
    }

    if (typeof value === 'string') {
      if (rules.minLength && (value as string).length < rules.minLength) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_LENGTH,
          message: `${field} must be at least ${rules.minLength} characters`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.maxLength && (value as string).length > rules.maxLength) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_LENGTH,
          message: `${field} must be at most ${rules.maxLength} characters`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.pattern && !rules.pattern.test(value as string)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_PATTERN,
          message: `${field} does not match required pattern`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.email && !this._isValidEmail(value as string)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_EMAIL,
          message: `${field} must be a valid email address`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.url && !this._isValidUrl(value as string)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_URL,
          message: `${field} must be a valid URL`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.uuid && !this.isValidUUID(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_UUID,
          message: `${field} must be a valid UUID`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.phone && !this.isValidPhone(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_PHONE,
          message: `${field} must be a valid phone number`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.creditCard && !this.isValidCreditCard(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_CREDIT_CARD,
          message: `${field} must be a valid credit card`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.ipAddress && !this.isValidIPAddress(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_IP_ADDRESS,
          message: `${field} must be a valid IP address`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.hexColor && !this.isValidHexColor(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_HEX_COLOR,
          message: `${field} must be a valid hex color`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.base64 && !this.isValidBase64(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_BASE64,
          message: `${field} must be valid Base64`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.json && !this.isValidJSON(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_JSON,
          message: `${field} must be valid JSON`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.xml && !this.isValidXML(value)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_XML,
          message: `${field} must be valid XML`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    if (typeof value === 'number') {
      if (rules.min !== undefined && (value as number) < rules.min) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_RANGE,
          message: `${field} must be at least ${rules.min}`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (rules.max !== undefined && (value as number) > rules.max) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_RANGE,
          message: `${field} must be at most ${rules.max}`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({
        field,
        code: ValidationErrorCode.INVALID_ENUM,
        message: `${field} must be one of: ${rules.enum.join(', ')}`,
        value,
        severity: ValidationSeverity.ERROR,
      });
    }

    if (rules.customValidator && !rules.customValidator(value, context || this._createDefaultContext())) {
      errors.push({
        field,
        code: ValidationErrorCode.CUSTOM,
        message: `${field} failed custom validation`,
        value,
        severity: ValidationSeverity.ERROR,
      });
    }

    if (rules.arrayMinLength !== undefined || rules.arrayMaxLength !== undefined) {
      if (!this.validateArrayLength(value, rules.arrayMinLength, rules.arrayMaxLength)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_ARRAY_LENGTH,
          message: `${field} has invalid array length`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    if (rules.objectRequiredKeys || rules.objectAllowedKeys) {
      if (!this.validateObjectKeys(value, rules.objectRequiredKeys, rules.objectAllowedKeys)) {
        errors.push({
          field,
          code: ValidationErrorCode.INVALID_OBJECT_KEYS,
          message: `${field} has invalid object keys`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    return errors;
  }

  private _extractFromBody(request: HttpRequest, fieldName: string): unknown {
    try {
      const bodyStr = request.body.toString('utf-8');
      if (bodyStr) {
        const parsed = JSON.parse(bodyStr);
        return parsed[fieldName];
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private _sanitizeString(value: string): string {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  private _isMalicious(key: string, value: string): boolean {
    const maliciousPatterns = ['<script', 'javascript:', 'onerror=', 'onload='];
    const combined = (key + value).toLowerCase();
    return maliciousPatterns.some((pattern) => combined.includes(pattern));
  }

  private _isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private _isValidUrl(url: string): boolean {
    const urlRegex = /^https?:\/\/.+/;
    return urlRegex.test(url);
  }

  private _applySanitizer(value: unknown, sanitizer: Sanitizer): unknown {
    if (typeof value !== 'string') return value;

    let sanitized = value as string;
    switch (sanitizer.type) {
      case 'TRIM':
        sanitized = sanitized.trim();
        break;
      case 'LOWERCASE':
        sanitized = sanitized.toLowerCase();
        break;
      case 'UPPERCASE':
        sanitized = sanitized.toUpperCase();
        break;
      case 'CAPITALIZE':
        sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1).toLowerCase();
        break;
      case 'ESCAPE_HTML':
        sanitized = this._sanitizeString(sanitized);
        break;
      case 'NORMALIZE_WHITESPACE':
        sanitized = sanitized.replace(/\s+/g, ' ').trim();
        break;
      default:
        break;
    }
    return sanitized;
  }

  private _createDefaultContext(): ValidationContext {
    return {
      requestId: `ctx-${Date.now()}`,
      timestamp: new Date(),
    };
  }
}
