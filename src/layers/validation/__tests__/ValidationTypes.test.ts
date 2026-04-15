/**
 * Validation Types Tests
 * 
 * Tests for Validation Layer type definitions and enums.
 * Ensures type correctness and enum uniqueness.
 */

import {
  ValidationErrorCode,
  ValidationWarningCode,
  ValidationSeverity,
  FieldType,
  SanitizerType,
} from '../types/validation-types';

describe('ValidationTypes', () => {
  describe('ValidationErrorCode', () => {
    it('should have unique error codes', () => {
      const codes = Object.values(ValidationErrorCode);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should contain all expected error codes', () => {
      expect(ValidationErrorCode.REQUIRED).toBe('REQUIRED');
      expect(ValidationErrorCode.INVALID_TYPE).toBe('INVALID_TYPE');
      expect(ValidationErrorCode.INVALID_FORMAT).toBe('INVALID_FORMAT');
      expect(ValidationErrorCode.INVALID_LENGTH).toBe('INVALID_LENGTH');
      expect(ValidationErrorCode.INVALID_RANGE).toBe('INVALID_RANGE');
      expect(ValidationErrorCode.INVALID_PATTERN).toBe('INVALID_PATTERN');
      expect(ValidationErrorCode.INVALID_ENUM).toBe('INVALID_ENUM');
      expect(ValidationErrorCode.INVALID_EMAIL).toBe('INVALID_EMAIL');
      expect(ValidationErrorCode.INVALID_URL).toBe('INVALID_URL');
      expect(ValidationErrorCode.INVALID_DATE).toBe('INVALID_DATE');
      expect(ValidationErrorCode.INVALID_UUID).toBe('INVALID_UUID');
      expect(ValidationErrorCode.INVALID_PHONE).toBe('INVALID_PHONE');
      expect(ValidationErrorCode.INVALID_CREDIT_CARD).toBe('INVALID_CREDIT_CARD');
      expect(ValidationErrorCode.INVALID_IP_ADDRESS).toBe('INVALID_IP_ADDRESS');
      expect(ValidationErrorCode.INVALID_HEX_COLOR).toBe('INVALID_HEX_COLOR');
      expect(ValidationErrorCode.INVALID_BASE64).toBe('INVALID_BASE64');
      expect(ValidationErrorCode.INVALID_JSON).toBe('INVALID_JSON');
      expect(ValidationErrorCode.INVALID_XML).toBe('INVALID_XML');
      expect(ValidationErrorCode.INVALID_BOOLEAN_STRING).toBe('INVALID_BOOLEAN_STRING');
      expect(ValidationErrorCode.INVALID_NUMBER_STRING).toBe('INVALID_NUMBER_STRING');
      expect(ValidationErrorCode.INVALID_NULL_VALUE).toBe('INVALID_NULL_VALUE');
      expect(ValidationErrorCode.INVALID_UNDEFINED_VALUE).toBe('INVALID_UNDEFINED_VALUE');
      expect(ValidationErrorCode.INVALID_ARRAY_LENGTH).toBe('INVALID_ARRAY_LENGTH');
      expect(ValidationErrorCode.INVALID_OBJECT_KEYS).toBe('INVALID_OBJECT_KEYS');
      expect(ValidationErrorCode.INVALID_NESTED_SCHEMA).toBe('INVALID_NESTED_SCHEMA');
      expect(ValidationErrorCode.CROSS_FIELD_VALIDATION).toBe('CROSS_FIELD_VALIDATION');
      expect(ValidationErrorCode.CONDITIONAL_VALIDATION).toBe('CONDITIONAL_VALIDATION');
      expect(ValidationErrorCode.ASYNC_VALIDATION).toBe('ASYNC_VALIDATION');
      expect(ValidationErrorCode.CUSTOM).toBe('CUSTOM');
    });
  });

  describe('ValidationWarningCode', () => {
    it('should have unique warning codes', () => {
      const codes = Object.values(ValidationWarningCode);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should contain all expected warning codes', () => {
      expect(ValidationWarningCode.DEPRECATED).toBe('DEPRECATED');
      expect(ValidationWarningCode.FUTURE_VALUE).toBe('FUTURE_VALUE');
      expect(ValidationWarningCode.PAST_VALUE).toBe('PAST_VALUE');
      expect(ValidationWarningCode.UNUSUAL_VALUE).toBe('UNUSUAL_VALUE');
      expect(ValidationWarningCode.WEAK_PASSWORD).toBe('WEAK_PASSWORD');
      expect(ValidationWarningCode.DUPLICATE_VALUE).toBe('DUPLICATE_VALUE');
      expect(ValidationWarningCode.SENSITIVE_DATA).toBe('SENSITIVE_DATA');
      expect(ValidationWarningCode.LARGE_PAYLOAD).toBe('LARGE_PAYLOAD');
      expect(ValidationWarningCode.MISSING_OPTIONAL_FIELD).toBe('MISSING_OPTIONAL_FIELD');
      expect(ValidationWarningCode.TYPE_COERCION).toBe('TYPE_COERCION');
    });
  });

  describe('ValidationSeverity', () => {
    it('should have unique severity levels', () => {
      const severities = Object.values(ValidationSeverity);
      const uniqueSeverities = new Set(severities);
      expect(severities.length).toBe(uniqueSeverities.size);
    });

    it('should contain all expected severity levels', () => {
      expect(ValidationSeverity.ERROR).toBe('ERROR');
      expect(ValidationSeverity.WARNING).toBe('WARNING');
      expect(ValidationSeverity.INFO).toBe('INFO');
    });
  });

  describe('FieldType', () => {
    it('should have unique field types', () => {
      const types = Object.values(FieldType);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('should contain all expected field types', () => {
      expect(FieldType.STRING).toBe('STRING');
      expect(FieldType.NUMBER).toBe('NUMBER');
      expect(FieldType.BOOLEAN).toBe('BOOLEAN');
      expect(FieldType.DATE).toBe('DATE');
      expect(FieldType.ARRAY).toBe('ARRAY');
      expect(FieldType.OBJECT).toBe('OBJECT');
      expect(FieldType.UUID).toBe('UUID');
      expect(FieldType.PHONE).toBe('PHONE');
      expect(FieldType.EMAIL).toBe('EMAIL');
      expect(FieldType.URL).toBe('URL');
      expect(FieldType.CREDIT_CARD).toBe('CREDIT_CARD');
      expect(FieldType.IP_ADDRESS).toBe('IP_ADDRESS');
      expect(FieldType.HEX_COLOR).toBe('HEX_COLOR');
      expect(FieldType.BASE64).toBe('BASE64');
      expect(FieldType.JSON).toBe('JSON');
      expect(FieldType.XML).toBe('XML');
      expect(FieldType.ANY).toBe('ANY');
    });
  });

  describe('SanitizerType', () => {
    it('should have unique sanitizer types', () => {
      const types = Object.values(SanitizerType);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('should contain all expected sanitizer types', () => {
      expect(SanitizerType.TRIM).toBe('TRIM');
      expect(SanitizerType.LOWERCASE).toBe('LOWERCASE');
      expect(SanitizerType.UPPERCASE).toBe('UPPERCASE');
      expect(SanitizerType.CAPITALIZE).toBe('CAPITALIZE');
      expect(SanitizerType.ESCAPE_HTML).toBe('ESCAPE_HTML');
      expect(SanitizerType.ESCAPE_REGEX).toBe('ESCAPE_REGEX');
      expect(SanitizerType.REMOVE_SCRIPTS).toBe('REMOVE_SCRIPTS');
      expect(SanitizerType.REMOVE_STYLES).toBe('REMOVE_STYLES');
      expect(SanitizerType.REMOVE_COMMENTS).toBe('REMOVE_COMMENTS');
      expect(SanitizerType.NORMALIZE_WHITESPACE).toBe('NORMALIZE_WHITESPACE');
      expect(SanitizerType.REMOVE_NULL_BYTES).toBe('REMOVE_NULL_BYTES');
      expect(SanitizerType.ENCODE_URI).toBe('ENCODE_URI');
      expect(SanitizerType.DECODE_URI).toBe('DECODE_URI');
      expect(SanitizerType.STRIP_TAGS).toBe('STRIP_TAGS');
      expect(SanitizerType.CUSTOM).toBe('CUSTOM');
    });
  });

  describe('Enum Uniqueness Across All Enums', () => {
    it('should have no duplicate values across all enums', () => {
      const allValues = [
        ...Object.values(ValidationErrorCode),
        ...Object.values(ValidationWarningCode),
        ...Object.values(ValidationSeverity),
        ...Object.values(FieldType),
        ...Object.values(SanitizerType),
      ];

      const uniqueValues = new Set(allValues);
      expect(allValues.length).toBe(uniqueValues.size);
    });
  });
});
