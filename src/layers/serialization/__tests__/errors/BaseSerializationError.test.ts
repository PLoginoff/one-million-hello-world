/**
 * Base Serialization Error Tests
 */

import { BaseSerializationError } from '../../errors/BaseSerializationError';
import { StrategyError } from '../../errors/StrategyError';
import { ValidationError } from '../../errors/ValidationError';

describe('BaseSerializationError', () => {
  describe('Creation', () => {
    it('should create error with code and message', () => {
      const error = new BaseSerializationError('TEST_CODE', 'Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
    });

    it('should include context', () => {
      const context = { key: 'value' };
      const error = new BaseSerializationError('TEST_CODE', 'Test message', context);
      expect(error.getContext()).toEqual(context);
    });

    it('should include cause', () => {
      const cause = new Error('Cause error');
      const error = new BaseSerializationError('TEST_CODE', 'Test message', undefined, cause);
      expect(error.getCause()).toBe(cause);
    });
  });

  describe('Serialization', () => {
    it('should convert to JSON', () => {
      const error = new BaseSerializationError('TEST_CODE', 'Test message');
      const json = error.toJSON();
      expect(json).toHaveProperty('code', 'TEST_CODE');
      expect(json).toHaveProperty('message', 'Test message');
      expect(json).toHaveProperty('timestamp');
    });

    it('should convert to string', () => {
      const error = new BaseSerializationError('TEST_CODE', 'Test message');
      const str = error.toString();
      expect(str).toContain('TEST_CODE');
      expect(str).toContain('Test message');
    });
  });
});

describe('StrategyError', () => {
  it('should create unsupported format error', () => {
    const error = StrategyError.unsupportedFormat('yaml');
    expect(error.message).toContain('yaml');
  });

  it('should create serialization failed error', () => {
    const error = StrategyError.serializationFailed();
    expect(error.message).toContain('Serialization failed');
  });
});

describe('ValidationError', () => {
  it('should create type mismatch error', () => {
    const error = ValidationError.typeMismatch('string', 'number');
    expect(error.message).toContain('string');
    expect(error.message).toContain('number');
  });

  it('should create schema validation failed error', () => {
    const error = ValidationError.schemaValidationFailed(['error1', 'error2']);
    expect(error.getContext()?.errors).toEqual(['error1', 'error2']);
  });
});
