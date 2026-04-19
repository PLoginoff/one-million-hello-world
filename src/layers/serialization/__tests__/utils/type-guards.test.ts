/**
 * Type Guards Tests
 */

import {
  isString,
  isNumber,
  isBoolean,
  isNull,
  isUndefined,
  isObject,
  isArray,
  isFunction,
  isDate,
  isSerializable,
  isPlainObject,
  isEmpty,
  isNotEmpty,
  isInteger,
  isFloat,
  isPositive,
  isNegative,
  isEmail,
  isURL,
  isUUID,
  isJSON,
} from '../../utils/type-guards';

describe('Type Guards', () => {
  describe('Basic Type Checks', () => {
    it('should check string', () => {
      expect(isString('test')).toBe(true);
      expect(isString(123)).toBe(false);
    });

    it('should check number', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber('123')).toBe(false);
      expect(isNumber(NaN)).toBe(false);
    });

    it('should check boolean', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(1)).toBe(false);
    });

    it('should check null', () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
    });

    it('should check undefined', () => {
      expect(isUndefined(undefined)).toBe(true);
      expect(isUndefined(null)).toBe(false);
    });

    it('should check object', () => {
      expect(isObject({})).toBe(true);
      expect(isObject([])).toBe(false);
      expect(isObject(null)).toBe(false);
    });

    it('should check array', () => {
      expect(isArray([])).toBe(true);
      expect(isArray({})).toBe(false);
    });

    it('should check function', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction({})).toBe(false);
    });

    it('should check date', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate({})).toBe(false);
    });
  });

  describe('Complex Type Checks', () => {
    it('should check serializable', () => {
      expect(isSerializable({ a: 1, b: 'test' })).toBe(true);
      expect(isSerializable(() => {})).toBe(false);
    });

    it('should check plain object', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject(new Date())).toBe(false);
    });

    it('should check empty', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty('test')).toBe(false);
    });

    it('should check not empty', () => {
      expect(isNotEmpty('test')).toBe(true);
      expect(isNotEmpty('')).toBe(false);
    });
  });

  describe('Number Type Checks', () => {
    it('should check integer', () => {
      expect(isInteger(5)).toBe(true);
      expect(isInteger(5.5)).toBe(false);
    });

    it('should check float', () => {
      expect(isFloat(5.5)).toBe(true);
      expect(isFloat(5)).toBe(false);
    });

    it('should check positive', () => {
      expect(isPositive(5)).toBe(true);
      expect(isPositive(-5)).toBe(false);
    });

    it('should check negative', () => {
      expect(isNegative(-5)).toBe(true);
      expect(isNegative(5)).toBe(false);
    });
  });

  describe('String Format Checks', () => {
    it('should check email', () => {
      expect(isEmail('test@example.com')).toBe(true);
      expect(isEmail('invalid')).toBe(false);
    });

    it('should check URL', () => {
      expect(isURL('https://example.com')).toBe(true);
      expect(isURL('invalid')).toBe(false);
    });

    it('should check UUID', () => {
      expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUUID('invalid')).toBe(false);
    });

    it('should check JSON', () => {
      expect(isJSON('{"key":"value"}')).toBe(true);
      expect(isJSON('invalid')).toBe(false);
    });
  });
});
