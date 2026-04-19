/**
 * Serialization Error Unit Tests
 */

import {
  SerializationError,
  ErrorContext,
} from '../../errors/SerializationError';
import { SerializationErrorCode } from '../../errors/SerializationErrorCode';

describe('SerializationError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new SerializationError(
        SerializationErrorCode.SERIALIZATION_FAILED
      );

      expect(error.code).toBe(SerializationErrorCode.SERIALIZATION_FAILED);
      expect(error.message).toBe('Serialization failed');
      expect(error.name).toBe('SerializationError');
    });

    it('should create error with custom message', () => {
      const error = new SerializationError(
        SerializationErrorCode.SERIALIZATION_FAILED,
        'Custom error message'
      );

      expect(error.message).toBe('Custom error message');
    });

    it('should create error with context', () => {
      const context: ErrorContext = { field: 'value', number: 42 };
      const error = new SerializationError(
        SerializationErrorCode.SERIALIZATION_FAILED,
        undefined,
        context
      );

      expect(error.context).toEqual(context);
    });

    it('should create error with inner error', () => {
      const innerError = new Error('Inner error');
      const error = new SerializationError(
        SerializationErrorCode.SERIALIZATION_FAILED,
        undefined,
        {},
        innerError
      );

      expect(error.innerError).toBe(innerError);
    });

    it('should have timestamp', () => {
      const before = new Date();
      const error = new SerializationError(SerializationErrorCode.SERIALIZATION_FAILED);
      const after = new Date();

      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('static factory methods', () => {
    it('should create serialization failed error', () => {
      const error = SerializationError.serializationFailed({ field: 'value' });

      expect(error.code).toBe(SerializationErrorCode.SERIALIZATION_FAILED);
      expect(error.context).toEqual({ field: 'value' });
    });

    it('should create serialization failed error with inner error', () => {
      const innerError = new Error('Inner');
      const error = SerializationError.serializationFailed({}, innerError);

      expect(error.innerError).toBe(innerError);
    });

    it('should create unsupported format error', () => {
      const error = SerializationError.unsupportedFormat('yaml');

      expect(error.code).toBe(SerializationErrorCode.UNSUPPORTED_FORMAT);
      expect(error.message).toContain('yaml');
    });

    it('should create deserialization failed error', () => {
      const error = SerializationError.deserializationFailed({ field: 'value' });

      expect(error.code).toBe(SerializationErrorCode.DESERIALIZATION_FAILED);
      expect(error.context).toEqual({ field: 'value' });
    });

    it('should create validation failed error', () => {
      const errors = ['Error 1', 'Error 2'];
      const error = SerializationError.validationFailed(errors);

      expect(error.code).toBe(SerializationErrorCode.VALIDATION_FAILED);
      expect(error.context).toEqual({ errors });
    });

    it('should create content negotiation failed error', () => {
      const error = SerializationError.contentNegotiationFailed('text/unknown');

      expect(error.code).toBe(SerializationErrorCode.CONTENT_NEGOTIATION_FAILED);
      expect(error.context).toEqual({ acceptHeader: 'text/unknown' });
    });
  });

  describe('toJSON', () => {
    it('should convert error to JSON', () => {
      const innerError = new Error('Inner error');
      const context: ErrorContext = { field: 'value' };
      const error = new SerializationError(
        SerializationErrorCode.SERIALIZATION_FAILED,
        'Custom message',
        context,
        innerError
      );

      const json = error.toJSON();

      expect(json.name).toBe('SerializationError');
      expect(json.code).toBe(SerializationErrorCode.SERIALIZATION_FAILED);
      expect(json.message).toBe('Custom message');
      expect(json.context).toEqual(context);
      expect(json.timestamp).toBeDefined();
      expect(json.innerError).toBeDefined();
      expect(json.stack).toBeDefined();
    });
  });

  describe('fromJSON', () => {
    it('should create error from JSON', () => {
      const json = {
        name: 'SerializationError',
        code: SerializationErrorCode.SERIALIZATION_FAILED,
        message: 'Custom message',
        context: { field: 'value' },
        timestamp: new Date().toISOString(),
        innerError: {
          name: 'Error',
          message: 'Inner error',
        },
      };

      const error = SerializationError.fromJSON(json);

      expect(error.code).toBe(SerializationErrorCode.SERIALIZATION_FAILED);
      expect(error.message).toBe('Custom message');
      expect(error.context).toEqual({ field: 'value' });
    });
  });
});

describe('SerializationErrorCode', () => {
  it('should have all error codes', () => {
    expect(SerializationErrorCode.UNKNOWN_ERROR).toBe('SER_000');
    expect(SerializationErrorCode.INVALID_INPUT).toBe('SER_001');
    expect(SerializationErrorCode.INVALID_OUTPUT).toBe('SER_002');
    expect(SerializationErrorCode.SERIALIZATION_FAILED).toBe('SER_100');
    expect(SerializationErrorCode.UNSUPPORTED_FORMAT).toBe('SER_101');
    expect(SerializationErrorCode.DESERIALIZATION_FAILED).toBe('SER_200');
    expect(SerializationErrorCode.VALIDATION_FAILED).toBe('SER_500');
  });
});
