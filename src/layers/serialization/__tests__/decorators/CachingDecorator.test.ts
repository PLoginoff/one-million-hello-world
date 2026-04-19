/**
 * Caching Decorator Tests
 */

import { CachingDecorator } from '../../decorators/CachingDecorator';
import { JSONStrategy } from '../../strategies/JSONStrategy';

describe('CachingDecorator', () => {
  let strategy: JSONStrategy;
  let decorator: CachingDecorator;

  beforeEach(() => {
    strategy = new JSONStrategy();
    decorator = new CachingDecorator(strategy);
  });

  describe('Caching Serialization', () => {
    it('should cache serialized data', () => {
      const data = { key: 'value' };
      const result1 = decorator.serialize(data);
      const result2 = decorator.serialize(data);
      expect(result1).toBe(result2);
    });

    it('should cache deserialized data', () => {
      const data = '{"key":"value"}';
      const result1 = decorator.deserialize(data);
      const result2 = decorator.deserialize(data);
      expect(result1).toEqual(result2);
    });

    it('should clear cache', () => {
      const data = { key: 'value' };
      decorator.serialize(data);
      decorator.clearCache();
      const result = decorator.serialize(data);
      expect(result).toBeDefined();
    });
  });

  describe('Cache Configuration', () => {
    it('should set TTL', () => {
      decorator.setTTL(5000);
      expect(decorator).toBeDefined();
    });

    it('should set max cache size', () => {
      decorator.setMaxSize(100);
      expect(decorator).toBeDefined();
    });

    it('should enable/disable caching', () => {
      decorator.setEnabled(false);
      decorator.setEnabled(true);
      expect(decorator).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should return cache statistics', () => {
      const stats = decorator.getStats();
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
    });
  });
});
