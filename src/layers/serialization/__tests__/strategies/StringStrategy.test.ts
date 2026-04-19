/**
 * String Strategy Unit Tests
 */

import { StringStrategy } from '../../strategies/StringStrategy';
import { ContentType } from '../../types/serialization-types';

describe('StringStrategy', () => {
  let strategy: StringStrategy;

  beforeEach(() => {
    strategy = new StringStrategy();
  });

  describe('serialize', () => {
    it('should serialize object to string', () => {
      const data = { message: 'Hello' };
      const result = strategy.serialize(data);

      expect(result).toBe('[object Object]');
    });

    it('should serialize string to string', () => {
      const data = 'Hello';
      const result = strategy.serialize(data);

      expect(result).toBe('Hello');
    });

    it('should serialize number to string', () => {
      const data = 42;
      const result = strategy.serialize(data);

      expect(result).toBe('42');
    });

    it('should serialize boolean to string', () => {
      const data = true;
      const result = strategy.serialize(data);

      expect(result).toBe('true');
    });

    it('should serialize null to string', () => {
      const data = null;
      const result = strategy.serialize(data);

      expect(result).toBe('null');
    });

    it('should serialize array to string', () => {
      const data = [1, 2, 3];
      const result = strategy.serialize(data);

      expect(result).toBe('1,2,3');
    });
  });

  describe('deserialize', () => {
    it('should deserialize string to string', () => {
      const data = 'Hello';
      const result = strategy.deserialize(data);

      expect(result).toBe('Hello');
    });

    it('should deserialize number string', () => {
      const data = '42';
      const result = strategy.deserialize(data);

      expect(result).toBe('42');
    });

    it('should deserialize boolean string', () => {
      const data = 'true';
      const result = strategy.deserialize(data);

      expect(result).toBe('true');
    });

    it('should deserialize empty string', () => {
      const data = '';
      const result = strategy.deserialize(data);

      expect(result).toBe('');
    });
  });

  describe('getContentType', () => {
    it('should return plain text content type', () => {
      expect(strategy.getContentType()).toBe(ContentType.PLAIN_TEXT);
    });
  });

  describe('getFormatName', () => {
    it('should return format name', () => {
      expect(strategy.getFormatName()).toBe('string');
    });
  });

  describe('canSerialize', () => {
    it('should return true for all defined values', () => {
      expect(strategy.canSerialize('')).toBe(true);
      expect(strategy.canSerialize(42)).toBe(true);
      expect(strategy.canSerialize(true)).toBe(true);
      expect(strategy.canSerialize(null)).toBe(true);
      expect(strategy.canSerialize({})).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(strategy.canSerialize(undefined)).toBe(false);
    });
  });

  describe('canDeserialize', () => {
    it('should return true for strings', () => {
      expect(strategy.canDeserialize('')).toBe(true);
      expect(strategy.canDeserialize('Hello')).toBe(true);
      expect(strategy.canDeserialize('42')).toBe(true);
    });
  });
});
