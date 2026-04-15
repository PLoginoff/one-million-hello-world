/**
 * Validator Edge Cases Tests
 * 
 * Edge case tests for Validator implementation.
 * Tests error handling, empty/malformed inputs, boundary values, and unusual scenarios.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Validator } from '../implementations/Validator';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ValidationSchema,
  FieldValidation,
  FieldType,
} from '../types/validation-types';

describe('Validator Edge Cases', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('Empty and Null Inputs', () => {
    it('should handle empty schema', () => {
      const schema: ValidationSchema = {
        fields: {},
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should handle null values in request', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: false,
            type: FieldType.STRING,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', '']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should handle undefined field values', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: false,
            type: FieldType.STRING,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });
  });

  describe('Boundary Values', () => {
    it('should handle minimum string length boundary', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.STRING,
            minLength: 5,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'abcde']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should fail when string length is below minimum', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.STRING,
            minLength: 5,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'abcd']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });

    it('should handle maximum string length boundary', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.STRING,
            maxLength: 10,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'abcdefghij']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should fail when string length exceeds maximum', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.STRING,
            maxLength: 10,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'abcdefghijk']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });

    it('should handle number range boundaries', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.NUMBER,
            min: 0,
            max: 100,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', '0']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should fail when number is below minimum', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.NUMBER,
            min: 0,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', '-1']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Malformed Inputs', () => {
    it('should handle invalid JSON in body', () => {
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
        headers: new Map(),
        body: Buffer.from('{invalid json'),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });

    it('should handle invalid email format', () => {
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
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['email', 'invalid-email']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });

    it('should handle invalid URL format', () => {
      const schema: ValidationSchema = {
        fields: {
          url: {
            required: true,
            type: FieldType.STRING,
            url: true,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['url', 'invalid-url']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Type Mismatches', () => {
    it('should handle string when number expected', () => {
      const schema: ValidationSchema = {
        fields: {
          field: {
            required: true,
            type: FieldType.NUMBER,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', 'not-a-number']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });

    it('should handle number when string expected', () => {
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
        headers: new Map([['field', '123']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Special Characters', () => {
    it('should handle special characters in strings', () => {
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
        headers: new Map([['field', 'test!@#$%^&*()']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should sanitize HTML entities', () => {
      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['field', '<script>alert("xss")</script>']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.sanitize(request);

      expect(result.changed).toBe(true);
    });
  });

  describe('Enum Validation', () => {
    it('should handle valid enum value', () => {
      const schema: ValidationSchema = {
        fields: {
          status: {
            required: true,
            type: FieldType.STRING,
            enum: ['active', 'inactive', 'pending'],
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['status', 'active']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should fail with invalid enum value', () => {
      const schema: ValidationSchema = {
        fields: {
          status: {
            required: true,
            type: FieldType.STRING,
            enum: ['active', 'inactive', 'pending'],
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['status', 'deleted']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Pattern Matching', () => {
    it('should handle valid pattern match', () => {
      const schema: ValidationSchema = {
        fields: {
          code: {
            required: true,
            type: FieldType.STRING,
            pattern: /^[A-Z]{3}[0-9]{3}$/,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['code', 'ABC123']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
    });

    it('should fail with invalid pattern match', () => {
      const schema: ValidationSchema = {
        fields: {
          code: {
            required: true,
            type: FieldType.STRING,
            pattern: /^[A-Z]{3}[0-9]{3}$/,
          },
        },
        strictMode: true,
        sanitize: true,
        version: '1.0.0',
      };

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/api/test', version: 'HTTP/1.1' as const },
        headers: new Map([['code', 'abc123']]),
        body: Buffer.from(''),
        raw: Buffer.from('POST /api/test HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('Array and Object Validation', () => {
    it('should handle empty array', () => {
      expect(validator.validateArrayLength([], 0, 10)).toBe(true);
    });

    it('should handle array with single element', () => {
      expect(validator.validateArrayLength([1], 1, 10)).toBe(true);
    });

    it('should handle empty object', () => {
      expect(validator.validateObjectKeys({}, [], [])).toBe(true);
    });

    it('should handle object with single key', () => {
      expect(validator.validateObjectKeys({ a: 1 }, ['a'], ['a', 'b'])).toBe(true);
    });
  });

  describe('Format Validation Edge Cases', () => {
    it('should handle empty UUID string', () => {
      expect(validator.isValidUUID('')).toBe(false);
    });

    it('should handle malformed UUID', () => {
      expect(validator.isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should handle empty phone string', () => {
      expect(validator.isValidPhone('')).toBe(false);
    });

    it('should handle empty credit card string', () => {
      expect(validator.isValidCreditCard('')).toBe(false);
    });

    it('should handle empty IP address string', () => {
      expect(validator.isValidIPAddress('')).toBe(false);
    });

    it('should handle empty hex color string', () => {
      expect(validator.isValidHexColor('')).toBe(false);
    });

    it('should handle empty Base64 string', () => {
      expect(validator.isValidBase64('')).toBe(false);
    });

    it('should handle empty JSON string', () => {
      expect(validator.isValidJSON('')).toBe(false);
    });

    it('should handle empty XML string', () => {
      expect(validator.isValidXML('')).toBe(false);
    });
  });

  describe('Sanitization Edge Cases', () => {
    it('should handle non-string value in sanitization', () => {
      const sanitizers = [{ name: 'trim', type: 'TRIM' }];
      const result = validator.sanitizeField('test', 123, sanitizers);
      expect(result).toBe(123);
    });

    it('should handle null value in sanitization', () => {
      const sanitizers = [{ name: 'trim', type: 'TRIM' }];
      const result = validator.sanitizeField('test', null, sanitizers);
      expect(result).toBe(null);
    });

    it('should handle undefined value in sanitization', () => {
      const sanitizers = [{ name: 'trim', type: 'TRIM' }];
      const result = validator.sanitizeField('test', undefined, sanitizers);
      expect(result).toBe(undefined);
    });
  });
});
