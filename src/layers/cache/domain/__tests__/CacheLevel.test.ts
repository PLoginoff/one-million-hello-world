/**
 * CacheLevel Unit Tests
 * 
 * Tests for CacheLevel value object using AAA pattern.
 */

import { CacheLevel } from '../value-objects/CacheLevel';

describe('CacheLevel', () => {
  describe('L1', () => {
    it('should create L1 cache level', () => {
      const level = CacheLevel.L1();
      
      expect(level.value).toBe('L1');
    });

    it('should be higher than L2', () => {
      const l1 = CacheLevel.L1();
      const l2 = CacheLevel.L2();
      
      expect(l1.isHigherThan(l2)).toBe(true);
    });

    it('should be higher than L3', () => {
      const l1 = CacheLevel.L1();
      const l3 = CacheLevel.L3();
      
      expect(l1.isHigherThan(l3)).toBe(true);
    });

    it('should not be lower than L2', () => {
      const l1 = CacheLevel.L1();
      const l2 = CacheLevel.L2();
      
      expect(l1.isLowerThan(l2)).toBe(false);
    });

    it('should not be lower than L3', () => {
      const l1 = CacheLevel.L1();
      const l3 = CacheLevel.L3();
      
      expect(l1.isLowerThan(l3)).toBe(false);
    });
  });

  describe('L2', () => {
    it('should create L2 cache level', () => {
      const level = CacheLevel.L2();
      
      expect(level.value).toBe('L2');
    });

    it('should be lower than L1', () => {
      const l2 = CacheLevel.L2();
      const l1 = CacheLevel.L1();
      
      expect(l2.isLowerThan(l1)).toBe(true);
    });

    it('should be higher than L3', () => {
      const l2 = CacheLevel.L2();
      const l3 = CacheLevel.L3();
      
      expect(l2.isHigherThan(l3)).toBe(true);
    });

    it('should not be higher than L1', () => {
      const l2 = CacheLevel.L2();
      const l1 = CacheLevel.L1();
      
      expect(l2.isHigherThan(l1)).toBe(false);
    });

    it('should not be lower than L3', () => {
      const l2 = CacheLevel.L2();
      const l3 = CacheLevel.L3();
      
      expect(l2.isLowerThan(l3)).toBe(false);
    });
  });

  describe('L3', () => {
    it('should create L3 cache level', () => {
      const level = CacheLevel.L3();
      
      expect(level.value).toBe('L3');
    });

    it('should be lower than L1', () => {
      const l3 = CacheLevel.L3();
      const l1 = CacheLevel.L1();
      
      expect(l3.isLowerThan(l1)).toBe(true);
    });

    it('should be lower than L2', () => {
      const l3 = CacheLevel.L3();
      const l2 = CacheLevel.L2();
      
      expect(l3.isLowerThan(l2)).toBe(true);
    });

    it('should not be higher than L1', () => {
      const l3 = CacheLevel.L3();
      const l1 = CacheLevel.L1();
      
      expect(l3.isHigherThan(l1)).toBe(false);
    });

    it('should not be higher than L2', () => {
      const l3 = CacheLevel.L3();
      const l2 = CacheLevel.L2();
      
      expect(l3.isHigherThan(l2)).toBe(false);
    });
  });

  describe('isHigherThan', () => {
    it('should return false for same level', () => {
      const l1a = CacheLevel.L1();
      const l1b = CacheLevel.L1();
      
      expect(l1a.isHigherThan(l1b)).toBe(false);
    });
  });

  describe('isLowerThan', () => {
    it('should return false for same level', () => {
      const l1a = CacheLevel.L1();
      const l1b = CacheLevel.L1();
      
      expect(l1a.isLowerThan(l1b)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const l1 = CacheLevel.L1();
      
      expect(l1.toString()).toBe('L1');
    });

    it('should return correct string for all levels', () => {
      expect(CacheLevel.L1().toString()).toBe('L1');
      expect(CacheLevel.L2().toString()).toBe('L2');
      expect(CacheLevel.L3().toString()).toBe('L3');
    });
  });

  describe('fromString', () => {
    it('should create L1 from string', () => {
      const level = CacheLevel.fromString('L1');
      
      expect(level.value).toBe('L1');
    });

    it('should create L2 from string', () => {
      const level = CacheLevel.fromString('L2');
      
      expect(level.value).toBe('L2');
    });

    it('should create L3 from string', () => {
      const level = CacheLevel.fromString('L3');
      
      expect(level.value).toBe('L3');
    });

    it('should throw error for invalid string', () => {
      expect(() => {
        CacheLevel.fromString('L4');
      }).toThrow('Invalid cache level: L4');
    });

    it('should be case sensitive', () => {
      expect(() => {
        CacheLevel.fromString('l1');
      }).toThrow('Invalid cache level: l1');
    });
  });

  describe('edge cases', () => {
    it('should handle comparison correctly', () => {
      const levels = [CacheLevel.L1(), CacheLevel.L2(), CacheLevel.L3()];
      
      for (let i = 0; i < levels.length; i++) {
        for (let j = 0; j < levels.length; j++) {
          if (i < j) {
            expect(levels[i].isHigherThan(levels[j])).toBe(true);
            expect(levels[i].isLowerThan(levels[j])).toBe(false);
          } else if (i > j) {
            expect(levels[i].isHigherThan(levels[j])).toBe(false);
            expect(levels[i].isLowerThan(levels[j])).toBe(true);
          } else {
            expect(levels[i].isHigherThan(levels[j])).toBe(false);
            expect(levels[i].isLowerThan(levels[j])).toBe(false);
          }
        }
      }
    });
  });
});
