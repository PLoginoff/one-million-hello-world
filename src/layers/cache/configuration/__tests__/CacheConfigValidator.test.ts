/**
 * CacheConfigValidator Unit Tests
 * 
 * Tests for CacheConfigValidator using AAA pattern.
 */

import { CacheConfigValidator } from '../validators/CacheConfigValidator';
import { InvalidationStrategy } from '../../types/cache-types';

describe('CacheConfigValidator', () => {
  describe('validateMaxSize', () => {
    it('should accept valid maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(1000);
      }).not.toThrow();
    });

    it('should accept minimum maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(1);
      }).not.toThrow();
    });

    it('should accept maximum maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(1000000);
      }).not.toThrow();
    });

    it('should throw error for zero maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(0);
      }).toThrow();
    });

    it('should throw error for negative maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(-1);
      }).toThrow();
    });

    it('should throw error for too large maxSize', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(1000001);
      }).toThrow();
    });
  });

  describe('validateDefaultTTL', () => {
    it('should accept valid TTL', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(60000);
      }).not.toThrow();
    });

    it('should accept zero TTL', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(0);
      }).not.toThrow();
    });

    it('should accept maximum TTL', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(86400000);
      }).not.toThrow();
    });

    it('should throw error for negative TTL', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(-1);
      }).toThrow();
    });

    it('should throw error for too large TTL', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(86400001);
      }).toThrow();
    });
  });

  describe('validateInvalidationStrategy', () => {
    it('should accept LRU strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.LRU);
      }).not.toThrow();
    });

    it('should accept LFU strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.LFU);
      }).not.toThrow();
    });

    it('should accept FIFO strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.FIFO);
      }).not.toThrow();
    });

    it('should accept TIME_BASED strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.TIME_BASED);
      }).not.toThrow();
    });

    it('should accept MANUAL strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.MANUAL);
      }).not.toThrow();
    });

    it('should accept RANDOM strategy', () => {
      expect(() => {
        CacheConfigValidator.validateInvalidationStrategy(InvalidationStrategy.RANDOM);
      }).not.toThrow();
    });
  });

  describe('validateMultiLevel', () => {
    it('should accept true', () => {
      expect(() => {
        CacheConfigValidator.validateMultiLevel(true);
      }).not.toThrow();
    });

    it('should accept false', () => {
      expect(() => {
        CacheConfigValidator.validateMultiLevel(false);
      }).not.toThrow();
    });
  });

  describe('validate', () => {
    it('should accept valid configuration', () => {
      const config = {
        maxSize: 1000,
        defaultTTL: 60000,
        invalidationStrategy: InvalidationStrategy.LRU,
        enableMultiLevel: false,
      };

      expect(() => {
        CacheConfigValidator.validate(config);
      }).not.toThrow();
    });

    it('should accept partial configuration', () => {
      const config = {
        maxSize: 500,
        defaultTTL: 30000,
      };

      expect(() => {
        CacheConfigValidator.validatePartial(config);
      }).not.toThrow();
    });

    it('should throw error for invalid maxSize', () => {
      const config = {
        maxSize: -1,
        defaultTTL: 60000,
        invalidationStrategy: InvalidationStrategy.LRU,
        enableMultiLevel: false,
      };

      expect(() => {
        CacheConfigValidator.validate(config);
      }).toThrow();
    });

    it('should throw error for invalid TTL', () => {
      const config = {
        maxSize: 1000,
        defaultTTL: -1,
        invalidationStrategy: InvalidationStrategy.LRU,
        enableMultiLevel: false,
      };

      expect(() => {
        CacheConfigValidator.validate(config);
      }).toThrow();
    });

    it('should throw error for invalid strategy', () => {
      const config = {
        maxSize: 1000,
        defaultTTL: 60000,
        invalidationStrategy: 'INVALID' as any,
        enableMultiLevel: false,
      };

      expect(() => {
        CacheConfigValidator.validate(config);
      }).toThrow();
    });
  });

  describe('validatePartial', () => {
    it('should accept empty partial', () => {
      expect(() => {
        CacheConfigValidator.validatePartial({});
      }).not.toThrow();
    });

    it('should accept partial with only maxSize', () => {
      expect(() => {
        CacheConfigValidator.validatePartial({ maxSize: 500 });
      }).not.toThrow();
    });

    it('should accept partial with only TTL', () => {
      expect(() => {
        CacheConfigValidator.validatePartial({ defaultTTL: 30000 });
      }).not.toThrow();
    });

    it('should throw error for invalid maxSize in partial', () => {
      expect(() => {
        CacheConfigValidator.validatePartial({ maxSize: -1 });
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle boundary values', () => {
      expect(() => {
        CacheConfigValidator.validateMaxSize(1);
        CacheConfigValidator.validateMaxSize(1000000);
        CacheConfigValidator.validateDefaultTTL(0);
        CacheConfigValidator.validateDefaultTTL(86400000);
      }).not.toThrow();
    });

    it('should handle large numbers', () => {
      expect(() => {
        CacheConfigValidator.validateDefaultTTL(86400000);
      }).not.toThrow();
    });
  });
});
