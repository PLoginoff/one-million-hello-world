/**
 * Validator Unit Tests
 * 
 * Tests for Validator implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Validator } from '../implementations/Validator';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { ValidationErrorCode, FieldType } from '../types/validation-types';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('getDefaultSchema', () => {
    it('should return default schema', () => {
      const schema = validator.getDefaultSchema();

      expect(schema).toBeDefined();
      expect(schema.fields).toEqual({});
      expect(schema.strictMode).toBe(true);
      expect(schema.sanitize).toBe(true);
    });
  });

  describe('setDefaultSchema', () => {
    it('should update default schema', () => {
      const newSchema = {
        fields: {
          name: {
            required: true,
            type: FieldType.STRING,
            minLength: 1,
            maxLength: 100,
          },
        },
        strictMode: false,
        sanitize: false,
      };

      validator.setDefaultSchema(newSchema);
      const schema = validator.getDefaultSchema();

      expect(schema.fields.name).toBeDefined();
      expect(schema.strictMode).toBe(false);
      expect(schema.sanitize).toBe(false);
    });
  });

  describe('checkType', () => {
    it('should return true for matching string type', () => {
      expect(validator.checkType('test', 'string')).toBe(true);
    });

    it('should return false for non-matching type', () => {
      expect(validator.checkType(123, 'string')).toBe(false);
    });

    it('should return true for null value', () => {
      expect(validator.checkType(null, 'string')).toBe(true);
    });

    it('should return true for undefined value', () => {
      expect(validator.checkType(undefined, 'string')).toBe(true);
    });

    it('should return true for matching number type', () => {
      expect(validator.checkType(123, 'number')).toBe(true);
    });

    it('should return true for matching boolean type', () => {
      expect(validator.checkType(true, 'boolean')).toBe(true);
    });

    it('should return true for matching array type', () => {
      expect(validator.checkType([], 'array')).toBe(true);
    });

    it('should return true for matching object type', () => {
      expect(validator.checkType({}, 'object')).toBe(true);
    });
  });

  describe('validateField', () => {
    it('should validate valid string field', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        minLength: 1,
        maxLength: 100,
      };

      const result = validator.validateField('name', 'test', rules);

      expect(result).toBe(true);
    });

    it('should fail validation for string too short', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        minLength: 5,
      };

      const result = validator.validateField('name', 'abc', rules);

      expect(result).toBe(false);
    });

    it('should fail validation for string too long', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        maxLength: 5,
      };

      const result = validator.validateField('name', 'abcdefgh', rules);

      expect(result).toBe(false);
    });

    it('should fail validation for invalid type', () => {
      const rules = {
        required: true,
        type: FieldType.NUMBER,
      };

      const result = validator.validateField('name', 'not a number', rules);

      expect(result).toBe(false);
    });

    it('should fail validation for invalid email', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        email: true,
      };

      const result = validator.validateField('email', 'invalid-email', rules);

      expect(result).toBe(false);
    });

    it('should validate valid email', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        email: true,
      };

      const result = validator.validateField('email', 'test@example.com', rules);

      expect(result).toBe(true);
    });

    it('should fail validation for invalid URL', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        url: true,
      };

      const result = validator.validateField('url', 'not-a-url', rules);

      expect(result).toBe(false);
    });

    it('should validate valid URL', () => {
      const rules = {
        required: true,
        type: FieldType.STRING,
        url: true,
      };

      const result = validator.validateField('url', 'https://example.com', rules);

      expect(result).toBe(true);
    });
  });

  describe('validate', () => {
    it('should validate request with valid data', () => {
      const request = createMockRequest();
      request.headers.set('name', 'John Doe');

      const schema = {
        fields: {
          name: {
            required: true,
            type: FieldType.STRING,
            minLength: 1,
            maxLength: 100,
          },
        },
        strictMode: true,
        sanitize: true,
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required field', () => {
      const request = createMockRequest();

      const schema = {
        fields: {
          name: {
            required: true,
            type: FieldType.STRING,
          },
        },
        strictMode: true,
        sanitize: true,
      };

      const result = validator.validate(request, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.REQUIRED);
    });

    it('should use default schema when not provided', () => {
      const request = createMockRequest();

      const result = validator.validate(request, validator.getDefaultSchema());

      expect(result.valid).toBe(true);
    });
  });

  describe('sanitize', () => {
    it('should sanitize HTML in headers', () => {
      const request = createMockRequest();
      request.headers.set('name', '<script>alert(1)</script>');

      const result = validator.sanitize(request);

      expect(result.changed).toBe(true);
      expect(result.removedFields).toHaveLength(0);
    });

    it('should remove malicious fields', () => {
      const request = createMockRequest();
      request.headers.set('malicious', '<script>alert(1)</script>');

      const result = validator.sanitize(request);

      expect(result.changed).toBe(true);
      expect(result.removedFields).toContain('malicious');
    });

    it('should not change valid data', () => {
      const request = createMockRequest();
      request.headers.set('name', 'John Doe');

      const result = validator.sanitize(request);

      expect(result.changed).toBe(false);
      expect(result.removedFields).toHaveLength(0);
    });
  });
});

function createMockRequest(): HttpRequest {
  return {
    line: {
      method: HttpMethod.GET,
      path: '/',
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'),
  };
}
