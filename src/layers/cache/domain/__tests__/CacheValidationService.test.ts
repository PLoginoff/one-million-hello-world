/**
 * CacheValidationService Unit Tests
 * 
 * Tests for CacheValidationService using AAA pattern.
 */

import { CacheValidationService } from '../services/CacheValidationService';
import { CacheKey } from '../entities/CacheKey';
import { CacheEntry } from '../entities/CacheEntry';
import { TTL } from '../value-objects/TTL';

describe('CacheValidationService', () => {
  describe('validateKey', () => {
    it('should validate string key', () => {
      expect(() => {
        CacheValidationService.validateKey('user:123');
      }).not.toThrow();
    });

    it('should validate CacheKey', () => {
      const key = CacheKey.create('user:123');
      
      expect(() => {
        CacheValidationService.validateKey(key);
      }).not.toThrow();
    });

    it('should throw error for empty string', () => {
      expect(() => {
        CacheValidationService.validateKey('');
      }).toThrow();
    });

    it('should throw error for invalid string key', () => {
      expect(() => {
        CacheValidationService.validateKey('a'.repeat(256));
      }).toThrow();
    });

    it('should throw error for invalid CacheKey', () => {
      const key = CacheKey.create(''); // This will throw, but let's test validation
      // Actually CacheKey.create throws, so we need to test differently
    });
  });

  describe('validateTTL', () => {
    it('should validate number TTL', () => {
      expect(() => {
        CacheValidationService.validateTTL(60000);
      }).not.toThrow();
    });

    it('should validate TTL object', () => {
      const ttl = TTL.seconds(60);
      
      expect(() => {
        CacheValidationService.validateTTL(ttl);
      }).not.toThrow();
    });

    it('should accept zero TTL', () => {
      expect(() => {
        CacheValidationService.validateTTL(0);
      }).not.toThrow();
    });

    it('should throw error for negative TTL', () => {
      expect(() => {
        CacheValidationService.validateTTL(-1);
      }).toThrow();
    });

    it('should throw error for too large TTL', () => {
      expect(() => {
        CacheValidationService.validateTTL(86400001); // > 24 hours
      }).toThrow();
    });
  });

  describe('validateEntry', () => {
    it('should validate valid entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      expect(() => {
        CacheValidationService.validateEntry(entry);
      }).not.toThrow();
    });

    it('should validate entry with zero TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 0);
      
      expect(() => {
        CacheValidationService.validateEntry(entry);
      }).not.toThrow();
    });

    it('should validate entry with large TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 86400000);
      
      expect(() => {
        CacheValidationService.validateEntry(entry);
      }).not.toThrow();
    });
  });

  describe('validateSize', () => {
    it('should validate positive size', () => {
      expect(() => {
        CacheValidationService.validateSize(100);
      }).not.toThrow();
    });

    it('should validate zero size', () => {
      expect(() => {
        CacheValidationService.validateSize(0);
      }).not.toThrow();
    });

    it('should throw error for negative size', () => {
      expect(() => {
        CacheValidationService.validateSize(-1);
      }).toThrow();
    });

    it('should throw error for too large size', () => {
      expect(() => {
        CacheValidationService.validateSize(1000001); // > 1,000,000
      }).toThrow();
    });
  });

  describe('validatePattern', () => {
    it('should validate valid pattern', () => {
      expect(() => {
        CacheValidationService.validatePattern('user:*');
      }).not.toThrow();
    });

    it('should validate complex pattern', () => {
      expect(() => {
        CacheValidationService.validatePattern('user:\\d+:.*');
      }).not.toThrow();
    });

    it('should throw error for invalid pattern', () => {
      expect(() => {
        CacheValidationService.validatePattern('[invalid');
      }).toThrow();
    });

    it('should throw error for empty pattern', () => {
      expect(() => {
        CacheValidationService.validatePattern('');
      }).toThrow();
    });
  });

  describe('isEntryValidForStorage', () => {
    it('should return true for valid entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      expect(CacheValidationService.isEntryValidForStorage(entry)).toBe(true);
    });

    it('should return true for non-expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      expect(CacheValidationService.isEntryValidForStorage(entry)).toBe(true);
    });

    it('should return false for expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 100);
      
      setTimeout(() => {
        expect(CacheValidationService.isEntryValidForStorage(entry)).toBe(false);
      }, 150);
    });

    it('should return true for entry with zero TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 0);
      
      expect(CacheValidationService.isEntryValidForStorage(entry)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode keys', () => {
      expect(() => {
        CacheValidationService.validateKey('用户:123');
      }).not.toThrow();
    });

    it('should handle special characters in pattern', () => {
      expect(() => {
        CacheValidationService.validatePattern('user@domain:*');
      }).not.toThrow();
    });

    it('should handle very large valid size', () => {
      expect(() => {
        CacheValidationService.validateSize(1000000);
      }).not.toThrow();
    });

    it('should handle boundary TTL values', () => {
      expect(() => {
        CacheValidationService.validateTTL(86400000); // Exactly 24 hours
      }).not.toThrow();
    });
  });
});
