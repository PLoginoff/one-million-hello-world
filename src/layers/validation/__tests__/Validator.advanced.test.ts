/**
 * Validator Advanced Tests
 * 
 * Advanced feature tests for Validator implementation.
 * Tests extended validation, sanitization, cross-field rules, conditional rules, and diagnostics.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Validator } from '../implementations/Validator';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ValidationSchema,
  FieldValidation,
  FieldType,
  ValidationContext,
  CrossFieldRule,
  ConditionalRule,
  Sanitizer,
  SanitizerType,
  ValidationErrorCode,
  ValidationWarningCode,
} from '../types/validation-types';

describe('Validator Advanced', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Extended Validation', () => {
    it('should validate with extended result', () => {
      const schema: ValidationSchema = {
        fields: {
          email: {
            required: true,
            type: FieldType.STRING,
            email: true,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/validate', version: 'HTTP/1.1' as const },
        headers: new Map([['email', 'test@example.com']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/validate HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validateExtended(request, schema);

      expect(result.valid).toBe(true);
      expect(result.sanitizedData).toBeDefined();
      expect(result.validationTime).toBeGreaterThanOrEqual(0);
      expect(result.schemaVersion).toBe('1.0.0');
      expect(result.validationContext).toBeDefined();
    });
  });

  describe('Field Sanitization', () => {
    it('should sanitize field with trim sanitizer', () => {
      const sanitizers: Sanitizer[] = [
        { name: 'trim', type: SanitizerType.TRIM },
      ];

      const result = validator.sanitizeField('test', '  value  ', sanitizers);

      expect(result).toBe('value');
    });

    it('should sanitize field with lowercase sanitizer', () => {
      const sanitizers: Sanitizer[] = [
        { name: 'lowercase', type: SanitizerType.LOWERCASE },
      ];

      const result = validator.sanitizeField('test', 'VALUE', sanitizers);

      expect(result).toBe('value');
    });

    it('should sanitize field with multiple sanitizers', () => {
      const sanitizers: Sanitizer[] = [
        { name: 'trim', type: SanitizerType.TRIM },
        { name: 'lowercase', type: SanitizerType.LOWERCASE },
      ];

      const result = validator.sanitizeField('test', '  VALUE  ', sanitizers);

      expect(result).toBe('value');
    });
  });

  describe('Nested Schema Validation', () => {
    it('should validate nested schema', () => {
      const nestedSchema: ValidationSchema = {
        fields: {
          name: {
            required: true,
            type: FieldType.STRING,
          },
          age: {
            required: true,
            type: FieldType.NUMBER,
            min: 0,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const data = {
        name: 'John',
        age: 30,
      };

      const result = validator.validateNestedSchema(data, nestedSchema, 'user');

      expect(result.valid).toBe(true);
      expect(result.metrics.fieldsChecked).toBe(2);
    });
  });

  describe('Cross-Field Rules', () => {
    it('should validate cross-field rules', () => {
      const rules: CrossFieldRule[] = [
        {
          id: 'password-match',
          name: 'Password Match',
          fields: ['password', 'confirmPassword'],
          validator: (values) => values.password === values.confirmPassword,
          errorMessage: 'Passwords do not match',
          enabled: true,
        },
      ];

      const data = {
        password: 'secret123',
        confirmPassword: 'secret123',
      };

      const result = validator.validateCrossFieldRules(data, rules);

      expect(result.valid).toBe(true);
    });

    it('should fail cross-field validation when rules not met', () => {
      const rules: CrossFieldRule[] = [
        {
          id: 'password-match',
          name: 'Password Match',
          fields: ['password', 'confirmPassword'],
          validator: (values) => values.password === values.confirmPassword,
          errorMessage: 'Passwords do not match',
          enabled: true,
        },
      ];

      const data = {
        password: 'secret123',
        confirmPassword: 'different',
      };

      const result = validator.validateCrossFieldRules(data, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('Conditional Rules', () => {
    it('should apply conditional rule when condition is met', () => {
      const rules: ConditionalRule[] = [
        {
          id: 'age-gate',
          name: 'Age Gate',
          condition: (data) => (data.age as number) >= 18,
          then: {
            fields: {
              consent: {
                required: true,
                type: FieldType.BOOLEAN,
              },
            },
            strictMode: true,
            sanitize: true,
            version: '1.0.0',
          },
          enabled: true,
        },
      ];

      const data = {
        age: 25,
        consent: true,
      };

      const result = validator.validateConditionalRules(data, rules);

      expect(result.valid).toBe(true);
    });
  });

  describe('Validation Configuration', () => {
    it('should set and get validation config', () => {
      const config = {
        strictMode: false,
        sanitize: true,
        enableAsyncValidation: true,
        enableCrossFieldValidation: true,
        enableConditionalValidation: true,
        maxValidationTime: 10000,
        enableDiagnostics: true,
        enableHealthChecks: true,
        enableStatistics: true,
      };

      validator.setValidationConfig(config);
      const retrieved = validator.getValidationConfig();

      expect(retrieved.strictMode).toBe(false);
      expect(retrieved.maxValidationTime).toBe(10000);
    });
  });

  describe('Cross-Field Rule Management', () => {
    it('should add and remove cross-field rules', () => {
      const rule: CrossFieldRule = {
        id: 'test-rule',
        name: 'Test Rule',
        fields: ['field1', 'field2'],
        validator: () => true,
        errorMessage: 'Test error',
        enabled: true,
      };

      validator.addCrossFieldRule(rule);
      expect(validator.getCrossFieldRules().length).toBe(1);

      validator.removeCrossFieldRule('test-rule');
      expect(validator.getCrossFieldRules().length).toBe(0);
    });
  });

  describe('Conditional Rule Management', () => {
    it('should add and remove conditional rules', () => {
      const rule: ConditionalRule = {
        id: 'test-conditional',
        name: 'Test Conditional',
        condition: () => true,
        then: {
          fields: {},
          strictMode: true,
          sanitize: true,
          version: '1.0.0',
        },
        enabled: true,
      };

      validator.addConditionalRule(rule);
      expect(validator.getConditionalRules().length).toBe(1);

      validator.removeConditionalRule('test-conditional');
      expect(validator.getConditionalRules().length).toBe(0);
    });
  });

  describe('Health Status', () => {
    it('should return healthy status', () => {
      const health = validator.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBe(100);
      expect(health.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Diagnostics', () => {
    it('should run diagnostics successfully', () => {
      const diagnostics = validator.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBeGreaterThan(0);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Statistics', () => {
    it('should track validation statistics', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.STRING,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'value']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      validator.validate(request, schema);
      const stats = validator.getStatistics();

      expect(stats.totalValidations).toBe(1);
      expect(stats.successfulValidations).toBe(1);
    });

    it('should reset statistics', () => {
      validator.resetStatistics();
      const stats = validator.getStatistics();

      expect(stats.totalValidations).toBe(0);
      expect(stats.successfulValidations).toBe(0);
    });
  });

  describe('Format Validation', () => {
    it('should validate UUID format', () => {
      expect(validator.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(validator.isValidUUID('invalid')).toBe(false);
    });

    it('should validate phone format', () => {
      expect(validator.isValidPhone('+1234567890')).toBe(true);
      expect(validator.isValidPhone('invalid')).toBe(false);
    });

    it('should validate credit card format', () => {
      expect(validator.isValidCreditCard('4111111111111111')).toBe(true);
      expect(validator.isValidCreditCard('invalid')).toBe(false);
    });

    it('should validate IP address format', () => {
      expect(validator.isValidIPAddress('192.168.1.1')).toBe(true);
      expect(validator.isValidIPAddress('invalid')).toBe(false);
    });

    it('should validate hex color format', () => {
      expect(validator.isValidHexColor('#ffffff')).toBe(true);
      expect(validator.isValidHexColor('#fff')).toBe(true);
      expect(validator.isValidHexColor('invalid')).toBe(false);
    });

    it('should validate Base64 format', () => {
      expect(validator.isValidBase64('SGVsbG8gV29ybGQ=')).toBe(true);
      expect(validator.isValidBase64('invalid')).toBe(false);
    });

    it('should validate JSON format', () => {
      expect(validator.isValidJSON('{"key":"value"}')).toBe(true);
      expect(validator.isValidJSON('invalid')).toBe(false);
    });

    it('should validate XML format', () => {
      expect(validator.isValidXML('<root></root>')).toBe(true);
      expect(validator.isValidXML('invalid')).toBe(false);
    });
  });

  describe('Custom Validators', () => {
    it('should add and remove custom validators', () => {
      const context: ValidationContext = {
        requestId: 'test',
        timestamp: new Date(),
      };

      validator.addCustomValidator('test', (value) => value === 'valid');
      expect(validator._customValidators.has('test')).toBe(true);

      validator.removeCustomValidator('test');
      expect(validator._customValidators.has('test')).toBe(false);
    });
  });

  describe('Error and Warning Messages', () => {
    it('should get error message by code', () => {
      const message = validator.getErrorMessage(ValidationErrorCode.REQUIRED, 'field');

      expect(message).toBe('field is required');
    });

    it('should get warning message by code', () => {
      const message = validator.getWarningMessage(ValidationWarningCode.DEPRECATED, 'field');

      expect(message).toBe('field is deprecated');
    });
  });

  describe('Validation Context', () => {
    it('should create validation context from request', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([
          ['user-id', 'user-123'],
          ['session-id', 'session-456'],
          ['user-agent', 'TestAgent'],
        ]),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const context = validator.createValidationContext(request);

      expect(context.requestId).toBeDefined();
      expect(context.userId).toBe('user-123');
      expect(context.sessionId).toBe('session-456');
      expect(context.userAgent).toBe('TestAgent');
    });
  });

  describe('Array Length Validation', () => {
    it('should validate array length', () => {
      expect(validator.validateArrayLength([1, 2, 3], 1, 5)).toBe(true);
      expect(validator.validateArrayLength([1, 2, 3], 5, 10)).toBe(false);
      expect(validator.validateArrayLength([1, 2, 3], 1, 2)).toBe(false);
    });
  });

  describe('Object Keys Validation', () => {
    it('should validate object keys', () => {
      expect(validator.validateObjectKeys({ a: 1, b: 2 }, ['a'], ['a', 'b'])).toBe(true);
      expect(validator.validateObjectKeys({ a: 1 }, ['a', 'b'])).toBe(false);
      expect(validator.validateObjectKeys({ a: 1, c: 2 }, ['a'], ['a', 'b'])).toBe(false);
    });
  });

  describe('Apply Sanitizers', () => {
    it('should apply multiple sanitizers to value', () => {
      const sanitizers: Sanitizer[] = [
        { name: 'trim', type: SanitizerType.TRIM },
        { name: 'lowercase', type: SanitizerType.LOWERCASE },
      ];

      const result = validator.applySanitizers('  VALUE  ', sanitizers);

      expect(result).toBe('value');
    });
  });
});
