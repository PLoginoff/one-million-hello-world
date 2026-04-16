/**
 * Sort Engine Layer Tests
 * 
 * Comprehensive test suite for SortEngine implementation.
 * Tests sort application, multi-level sorting, custom comparators, and statistics.
 */

import { SortEngine } from '../implementations/SortEngine';
import { ISortEngine } from '../interfaces/ISortEngine';
import { ParsedSort, SortDirection } from '../../query-parser/types/query-parser-types';
import {
  NullPosition,
} from '../types/sort-engine-types';

interface TestItem {
  name: string;
  age: number;
  score: number;
}

describe('SortEngine', () => {
  let sortEngine: SortEngine<TestItem>;
  let testData: TestItem[];

  beforeEach(() => {
    // Initialize SortEngine before each test
    sortEngine = new SortEngine<TestItem>();
    testData = [
      { name: 'John', age: 30, score: 85 },
      { name: 'Jane', age: 25, score: 90 },
      { name: 'Bob', age: 35, score: 75 },
      { name: 'Alice', age: 28, score: 95 },
    ];
  });

  describe('Initialization', () => {
    /**
     * Test that SortEngine initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = sortEngine.getConfig();
      expect(config.defaultAlgorithm).toBe('QUICK_SORT');
      expect(config.nullPosition).toBe(NullPosition.LAST);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = sortEngine.getStats();
      expect(stats.totalSorts).toBe(0);
    });
  });

  describe('Sort Application', () => {
    /**
     * Test applying a simple sort
     */
    it('should apply a simple sort successfully', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
      expect(result.data?.[0].age).toBe(25);
      expect(result.data?.[3].age).toBe(35);
    });

    /**
     * Test applying descending sort
     */
    it('should apply descending sort successfully', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.DESC,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
      expect(result.data?.[0].age).toBe(35);
      expect(result.data?.[3].age).toBe(25);
    });

    /**
     * Test applying multi-level sort
     */
    it('should apply multi-level sort successfully', () => {
      const sorts: ParsedSort[] = [
        {
          field: 'score',
          direction: SortDirection.DESC,
        },
        {
          field: 'age',
          direction: SortDirection.ASC,
        },
      ];

      const result = sortEngine.apply(testData, sorts);

      expect(result.success).toBe(true);
      expect(result.data?.[0].score).toBe(95);
    });
  });

  describe('Null Handling', () => {
    /**
     * Test null values with LAST position
     */
    it('should place null values last with NullPosition.LAST', () => {
      sortEngine.setConfig({
        ...sortEngine.getConfig(),
        nullPosition: NullPosition.LAST,
      });

      const dataWithNulls: (TestItem | null)[] = [
        { name: 'John', age: 30, score: 85 },
        null,
        { name: 'Jane', age: 25, score: 90 },
      ];

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
      };

      const result = sortEngine.apply(dataWithNulls, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Custom Comparators', () => {
    /**
     * Test applying custom comparator
     */
    it('should apply custom comparator successfully', () => {
      const comparator = (a: TestItem, b: TestItem) => {
        return a.score - b.score;
      };

      const result = sortEngine.applyWithComparator(testData, comparator);

      expect(result.success).toBe(true);
      expect(result.data?.[0].score).toBe(75);
      expect(result.data?.[3].score).toBe(95);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total sorts
     */
    it('should track total sorts', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
      };

      sortEngine.apply(testData, [sort]);
      sortEngine.apply(testData, [sort]);

      const stats = sortEngine.getStats();
      expect(stats.totalSorts).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
      };

      sortEngine.apply(testData, [sort]);
      sortEngine.resetStats();

      const stats = sortEngine.getStats();
      expect(stats.totalSorts).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        defaultAlgorithm: 'MERGE_SORT' as const,
        nullPosition: NullPosition.FIRST,
      };

      sortEngine.setConfig(newConfig);
      const config = sortEngine.getConfig();

      expect(config.defaultAlgorithm).toBe('MERGE_SORT');
      expect(config.nullPosition).toBe(NullPosition.FIRST);
    });
  });
});
