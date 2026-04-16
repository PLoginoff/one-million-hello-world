/**
 * TTL Unit Tests
 * 
 * Tests for TTL value object using AAA pattern.
 */

import { TTL, TimeUnit } from '../value-objects/TTL';

describe('TTL', () => {
  describe('milliseconds', () => {
    it('should create TTL from milliseconds', () => {
      const ttl = TTL.milliseconds(5000);
      
      expect(ttl.toMilliseconds()).toBe(5000);
    });

    it('should create TTL from zero milliseconds', () => {
      const ttl = TTL.milliseconds(0);
      
      expect(ttl.toMilliseconds()).toBe(0);
      expect(ttl.isInfinite()).toBe(true);
    });

    it('should create TTL from negative milliseconds', () => {
      const ttl = TTL.milliseconds(-1000);
      
      expect(ttl.toMilliseconds()).toBe(-1000);
    });
  });

  describe('seconds', () => {
    it('should create TTL from seconds', () => {
      const ttl = TTL.seconds(60);
      
      expect(ttl.toMilliseconds()).toBe(60000);
    });

    it('should create TTL from zero seconds', () => {
      const ttl = TTL.seconds(0);
      
      expect(ttl.toMilliseconds()).toBe(0);
      expect(ttl.isInfinite()).toBe(true);
    });

    it('should convert large seconds correctly', () => {
      const ttl = TTL.seconds(3600); // 1 hour
      
      expect(ttl.toMilliseconds()).toBe(3600000);
    });
  });

  describe('minutes', () => {
    it('should create TTL from minutes', () => {
      const ttl = TTL.minutes(5);
      
      expect(ttl.toMilliseconds()).toBe(300000);
    });

    it('should create TTL from zero minutes', () => {
      const ttl = TTL.minutes(0);
      
      expect(ttl.toMilliseconds()).toBe(0);
      expect(ttl.isInfinite()).toBe(true);
    });

    it('should convert large minutes correctly', () => {
      const ttl = TTL.minutes(60); // 1 hour
      
      expect(ttl.toMilliseconds()).toBe(3600000);
    });
  });

  describe('hours', () => {
    it('should create TTL from hours', () => {
      const ttl = TTL.hours(2);
      
      expect(ttl.toMilliseconds()).toBe(7200000);
    });

    it('should create TTL from zero hours', () => {
      const ttl = TTL.hours(0);
      
      expect(ttl.toMilliseconds()).toBe(0);
      expect(ttl.isInfinite()).toBe(true);
    });

    it('should convert large hours correctly', () => {
      const ttl = TTL.hours(24); // 1 day
      
      expect(ttl.toMilliseconds()).toBe(86400000);
    });
  });

  describe('isInfinite', () => {
    it('should return true for zero TTL', () => {
      const ttl = TTL.milliseconds(0);
      
      expect(ttl.isInfinite()).toBe(true);
    });

    it('should return false for non-zero TTL', () => {
      const ttl = TTL.milliseconds(1000);
      
      expect(ttl.isInfinite()).toBe(false);
    });
  });

  describe('toMilliseconds', () => {
    it('should return milliseconds value', () => {
      const ttl = TTL.seconds(10);
      
      expect(ttl.toMilliseconds()).toBe(10000);
    });

    it('should be consistent across conversions', () => {
      const ttl1 = TTL.seconds(60);
      const ttl2 = TTL.minutes(1);
      
      expect(ttl1.toMilliseconds()).toBe(ttl2.toMilliseconds());
    });
  });

  describe('withValue', () => {
    it('should create copy with new value', () => {
      const ttl = TTL.seconds(60);
      const newTtl = ttl.withValue(120);
      
      expect(newTtl.toMilliseconds()).toBe(120000);
      expect(ttl.toMilliseconds()).toBe(60000);
    });

    it('should preserve type', () => {
      const ttl = TTL.seconds(60);
      const newTtl = ttl.withValue(120);
      
      expect(newTtl instanceof TTL).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very large values', () => {
      const ttl = TTL.hours(1000);
      
      expect(ttl.toMilliseconds()).toBe(3600000000);
    });

    it('should handle fractional values', () => {
      const ttl = TTL.seconds(1.5);
      
      expect(ttl.toMilliseconds()).toBe(1500);
    });

    it('should handle negative values', () => {
      const ttl = TTL.seconds(-10);
      
      expect(ttl.toMilliseconds()).toBe(-10000);
      expect(ttl.isInfinite()).toBe(false);
    });
  });

  describe('TimeUnit enum', () => {
    it('should have MILLISECONDS', () => {
      expect(TimeUnit.MILLISECONDS).toBeDefined();
    });

    it('should have SECONDS', () => {
      expect(TimeUnit.SECONDS).toBeDefined();
    });

    it('should have MINUTES', () => {
      expect(TimeUnit.MINUTES).toBeDefined();
    });

    it('should have HOURS', () => {
      expect(TimeUnit.HOURS).toBeDefined();
    });
  });
});
