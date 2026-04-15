/**
 * Validator Integration Tests
 * 
 * Integration tests for Validator implementation.
 * Tests full validation workflows, configuration chaining, statistics tracking, and advanced features.
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
  ValidationConfig,
} from '../types/validation-types';

describe('Validator Integration', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Full Validation Workflow', () => {
    it('should complete full workflow with configuration, validation, and statistics', () => {
      validator.setValidationConfig({
        strictMode: true,
        sanitize: true,
        enableAsyncValidation: false,
        enableCrossFieldValidation: true,
        enableConditionalValidation: true,
        maxValidationTime: 5000,
        enableDiagnostics: true,
        enableHealthChecks: true,
        enableStatistics: true,
      });

      const schema: ValidationSchema = {
        fields: {
          email: {
            required: true,
            type: FieldType.STRING,
            email: true,
          },
          name: {
            required: true,
            type: FieldType.STRING,
            minLength: 2,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/validate', version: 'HTTP/1.1' as const },
        headers: new Map([
          ['email', 'test@example.com'],
          ['name', 'John Doe'],
        ]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/validate HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);
      const stats = validator.getStatistics();

      expect(result.valid).toBe(true);
      expect(stats.totalValidations).toBe(1);
      expect(stats.successfulValidations).toBe(1);
    });
  });

  describe('Configuration Chaining', () => {
    it('should support configuration updates during operation', () => {
      validator.setValidationConfig({
        strictMode: false,
        sanitize: true,
        enableAsyncValidation: false,
        enableCrossFieldValidation: true,
        enableConditionalValidation: true,
        maxValidationTime: 5000,
        enableDiagnostics: true,
        enableHealthChecks: true,
        enableStatistics: true,
      });

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

      validator.setValidationConfig({
        strictMode: true,
        sanitize: true,
        enableAsyncValidation: false,
        enableCrossFieldValidation: true,
        enableConditionalValidation: true,
        maxValidationTime: 10000,
        enableDiagnostics: true,
        enableHealthChecks: true,
        enableStatistics: true,
      });

      const config = validator.getValidationConfig();
      expect(config.maxValidationTime).toBe(10000);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics across multiple validations', () => {
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

      for (let i = 0; i < 5; i++) {
        const request: HttpRequest = {
          line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
          headers: new Map([['field', `value${i}`]]),
          body: Buffer.from(''),
          raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
        };
        validator.validate(request, schema);
      }

      const stats = validator.getStatistics();
      expect(stats.totalValidations).toBe(5);
      expect(stats.successfulValidations).toBe(5);
    });
  });

  describe('Health Status Integration', () => {
    it('should provide accurate health status based on system state', () => {
      validator.setValidationConfig({
        strictMode: true,
        sanitize: true,
        enableAsyncValidation: false,
        enableCrossFieldValidation: true,
        enableConditionalValidation: true,
        maxValidationTime: 5000,
        enableDiagnostics: true,
        enableHealthChecks: false,
        enableStatistics: false,
      });

      const health = validator.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBe(100);
      expect(health.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Diagnostics Integration', () => {
    it('should provide comprehensive diagnostics', () => {
      const diagnostics = validator.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBeGreaterThan(0);
      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });

  describe('Cross-Field Rules Integration', () => {
    it('should apply cross-field rules in validation workflow', () => {
      const rule: CrossFieldRule = {
        id: 'password-match',
        name: 'Password Match',
        fields: ['password', 'confirmPassword'],
        validator: (values) => values.password === values.confirmPassword,
        errorMessage: 'Passwords do not match',
        enabled: true,
      };

      validator.addCrossFieldRule(rule);

      const data = {
        password: 'secret123',
        confirmPassword: 'secret123',
      };

      const result = validator.validateCrossFieldRules(data, validator.getCrossFieldRules());

      expect(result.valid).toBe(true);
    });
  });

  describe('Conditional Rules Integration', () => {
    it('should apply conditional rules in validation workflow', () => {
      const rule: ConditionalRule = {
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
      };

      validator.addConditionalRule(rule);

      const data = {
        age: 25,
        consent: true,
      };

      const result = validator.validateConditionalRules(data, validator.getConditionalRules());

      expect(result.valid).toBe(true);
    });
  });

  describe('Extended Validation Integration', () => {
    it('should integrate validation and sanitization in extended workflow', () => {
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
        headers: new Map([['field', '  value  ']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validateExtended(request, schema);

      expect(result.valid).toBe(true);
      expect(result.sanitizedData).toBeDefined();
      expect(result.validationTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Format Validation Integration', () => {
    it('should integrate multiple format validations', () => {
      const schema: ValidationSchema = {
        fields: {
          email: {
            required: true,
            type: FieldType.STRING,
            email: true,
          },
          phone: {
            required: true,
            type: FieldType.STRING,
            phone: true,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([
          ['email', 'test@example.com'],
          ['phone', '+1234567890'],
        ]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });
  });

  describe('Sanitization Integration', () => {
    it('should integrate sanitizers in validation workflow', () => {
      const sanitizers: Sanitizer[] = [
        { name: 'trim', type: SanitizerType.TRIM },
        { name: 'lowercase', type: SanitizerType.LOWERCASE },
      ];

      const result = validator.applySanitizers('  VALUE  ', sanitizers);

      expect(result).toBe('value');
    });
  });

  describe('Validation Context Integration', () => {
    it('should integrate validation context with extended validation', () => {
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

      const context: ValidationContext = {
        requestId: 'test-request',
        timestamp: new Date(),
        userId: 'user-123',
      };

      const result = validator.validateExtended(request, schema, context);

      expect(result.validationContext.requestId).toBe('test-request');
      expect(result.validationContext.userId).toBe('user-123');
    });
  });

  describe('Nested Schema Integration', () => {
    it('should integrate nested schema validation with main workflow', () => {
      const nestedSchema: ValidationSchema = {
        fields: {
          name: {
            required: true,
            type: FieldType.STRING,
          },
          age: {
            required: true,
            type: FieldType.NUMBER,
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

  describe('Array and Object Validation Integration', () => {
    it('should integrate array and object validation', () => {
      const arrayValid = validator.validateArrayLength([1, 2, 3], 1, 5);
      const objectValid = validator.validateObjectKeys({ a: 1, b: 2 }, ['a'], ['a', 'b']);

      expect(arrayValid).toBe(true);
      expect(objectValid).toBe(true);
    });
  });

  describe('Statistics Reset Integration', () => {
    it('should integrate statistics reset with workflow', () => {
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
      validator.resetStatistics();

      const stats = validator.getStatistics();
      expect(stats.totalValidations).toBe(0);
    });
  });
});
