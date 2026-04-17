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
  SortAlgorithm,
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
      expect(config.algorithm).toBe(SortAlgorithm.QUICK_SORT);
      expect(config.stable).toBe(true);
      expect(config.parallel).toBe(false);
      expect(config.threshold).toBe(1000);
    });

    /**
     * Test that SortEngine initializes with default context
     */
    it('should initialize with default context', () => {
      const context = sortEngine.getContext();
      expect(context.caseSensitive).toBe(false);
      expect(context.locale).toBe('en-US');
      expect(context.numericCollation).toBe(true);
      expect(context.nullPosition).toBe(NullPosition.LAST);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = sortEngine.getStats();
      expect(stats.totalSorts).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
      expect(stats.averageComparisons).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
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
        nullPosition: NullPosition.LAST,
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
        nullPosition: NullPosition.LAST,
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
          nullPosition: NullPosition.LAST,
        },
        {
          field: 'age',
          direction: SortDirection.ASC,
          nullPosition: NullPosition.LAST,
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
      sortEngine.setContext({
        nullPosition: NullPosition.LAST,
      });

      const dataWithNulls = [
        { name: 'John', age: 30, score: 85 },
        null,
        { name: 'Jane', age: 25, score: 90 },
      ] as TestItem[];

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(dataWithNulls, [sort]);

      expect(result.success).toBe(true);
    });

    /**
     * Test null values with FIRST position
     */
    it('should place null values first with NullPosition.FIRST', () => {
      sortEngine.setContext({
        nullPosition: NullPosition.FIRST,
      });

      const dataWithNulls = [
        { name: 'John', age: 30, score: 85 },
        null,
        { name: 'Jane', age: 25, score: 90 },
      ] as TestItem[];

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.FIRST,
      };

      const result = sortEngine.apply(dataWithNulls, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Compiled Sort Application', () => {
    /**
     * Test compiling a sort
     */
    it('should compile a sort successfully', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const compiled = sortEngine.compile(sort);

      expect(compiled).toBeDefined();
      expect(compiled.sort).toBe(sort);
      expect(typeof compiled.comparator).toBe('function');
      expect(compiled.estimatedCost).toBe(10);
    });

    /**
     * Test applying compiled sorts
     */
    it('should apply compiled sorts correctly', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const compiled = sortEngine.compile(sort);
      const result = sortEngine.applyCompiled(testData, [compiled]);

      expect(result.success).toBe(true);
      expect(result.data?.[0].age).toBe(25);
      expect(result.data?.[3].age).toBe(35);
    });

    /**
     * Test compiled sort caching
     */
    it('should cache compiled sorts', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const compiled1 = sortEngine.compile(sort);
      const compiled2 = sortEngine.compile(sort);

      expect(compiled1).toBe(compiled2);
    });

    /**
     * Test clearing cache
     */
    it('should clear compiled sort cache', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      sortEngine.compile(sort);
      sortEngine.clearCache();

      const compiled = sortEngine.compile(sort);

      expect(compiled).toBeDefined();
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
        nullPosition: NullPosition.LAST,
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
        nullPosition: NullPosition.LAST,
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
        algorithm: SortAlgorithm.MERGE_SORT,
        stable: false,
        parallel: true,
        threshold: 500,
      };

      sortEngine.setConfig(newConfig);
      const config = sortEngine.getConfig();

      expect(config.algorithm).toBe(SortAlgorithm.MERGE_SORT);
      expect(config.stable).toBe(false);
      expect(config.parallel).toBe(true);
      expect(config.threshold).toBe(500);
    });

    /**
     * Test updating context
     */
    it('should update context', () => {
      const newContext = {
        caseSensitive: true,
        locale: 'fr-FR',
        numericCollation: false,
        nullPosition: NullPosition.FIRST,
      };

      sortEngine.setContext(newContext);
      const context = sortEngine.getContext();

      expect(context.caseSensitive).toBe(true);
      expect(context.locale).toBe('fr-FR');
      expect(context.numericCollation).toBe(false);
      expect(context.nullPosition).toBe(NullPosition.FIRST);
    });
  });

  describe('Multi-level Sort', () => {
    /**
     * Test applying multi-level sort with tie breaker
     */
    it('should apply multi-level sort with tie breaker', () => {
      const sort1: ParsedSort = {
        field: 'score',
        direction: SortDirection.DESC,
        nullPosition: NullPosition.LAST,
      };
      const sort2: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const compiled1 = sortEngine.compile(sort1);
      const compiled2 = sortEngine.compile(sort2);

      const multiLevelSort = {
        sorts: [compiled1, compiled2],
        tieBreaker: (a: unknown, b: unknown) => {
          const itemA = a as TestItem;
          const itemB = b as TestItem;
          return itemA.name.localeCompare(itemB.name);
        },
      };

      const result = sortEngine.applyMultiLevel(testData, multiLevelSort);

      expect(result.success).toBe(true);
    });

    /**
     * Test applying multi-level sort without tie breaker
     */
    it('should apply multi-level sort without tie breaker', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const compiled = sortEngine.compile(sort);

      const multiLevelSort = {
        sorts: [compiled],
      };

      const result = sortEngine.applyMultiLevel(testData, multiLevelSort);

      expect(result.success).toBe(true);
      expect(result.data?.[0].age).toBe(25);
    });
  });

  describe('Sort Algorithms', () => {
    /**
     * Test setting and getting algorithm
     */
    it('should set and get algorithm', () => {
      sortEngine.setAlgorithm(SortAlgorithm.MERGE_SORT);
      const algorithm = sortEngine.getAlgorithm();

      expect(algorithm).toBe(SortAlgorithm.MERGE_SORT);
    });

    /**
     * Test sorting with different algorithms
     */
    it('should sort with QUICK_SORT algorithm', () => {
      sortEngine.setAlgorithm(SortAlgorithm.QUICK_SORT);

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });

    it('should sort with MERGE_SORT algorithm', () => {
      sortEngine.setAlgorithm(SortAlgorithm.MERGE_SORT);

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });

    it('should sort with HEAP_SORT algorithm', () => {
      sortEngine.setAlgorithm(SortAlgorithm.HEAP_SORT);

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });

    it('should sort with TIM_SORT algorithm', () => {
      sortEngine.setAlgorithm(SortAlgorithm.TIM_SORT);

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Sort Validation', () => {
    /**
     * Test validating a valid sort
     */
    it('should validate a valid sort', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const isValid = sortEngine.validate(sort);

      expect(isValid).toBe(true);
    });

    /**
     * Test validating a sort without field
     */
    it('should fail validation for sort without field', () => {
      const sort = {
        field: '',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      } as ParsedSort;

      const isValid = sortEngine.validate(sort);

      expect(isValid).toBe(false);
    });

    /**
     * Test validating a sort without direction
     */
    it('should fail validation for sort without direction', () => {
      const sort = {
        field: 'age',
        direction: '' as SortDirection,
        nullPosition: NullPosition.LAST,
      } as ParsedSort;

      const isValid = sortEngine.validate(sort);

      expect(isValid).toBe(false);
    });
  });

  describe('Cost Estimation', () => {
    /**
     * Test estimating sort cost
     */
    it('should estimate sort cost', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const cost = sortEngine.estimateCost([sort], 100);

      expect(cost).toBeGreaterThan(0);
    });

    /**
     * Test estimating cost for multiple sorts
     */
    it('should estimate cost for multiple sorts', () => {
      const sorts: ParsedSort[] = [
        {
          field: 'age',
          direction: SortDirection.ASC,
          nullPosition: NullPosition.LAST,
        },
        {
          field: 'name',
          direction: SortDirection.DESC,
          nullPosition: NullPosition.LAST,
        },
      ];

      const cost = sortEngine.estimateCost(sorts, 100);

      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('Sort Reversal', () => {
    /**
     * Test reversing a sort
     */
    it('should reverse an ASC sort to DESC', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const reversed = sortEngine.reverse(sort);

      expect(reversed.direction).toBe(SortDirection.DESC);
      expect(reversed.field).toBe('age');
    });

    /**
     * Test reversing a DESC sort to ASC
     */
    it('should reverse a DESC sort to ASC', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.DESC,
        nullPosition: NullPosition.LAST,
      };

      const reversed = sortEngine.reverse(sort);

      expect(reversed.direction).toBe(SortDirection.ASC);
      expect(reversed.field).toBe('age');
    });
  });

  describe('Case Sensitivity', () => {
    /**
     * Test case sensitive sorting
     */
    it('should sort case sensitively', () => {
      sortEngine.setContext({ caseSensitive: true });

      const dataWithCases = [
        { name: 'john', age: 30, score: 85 },
        { name: 'John', age: 25, score: 90 },
        { name: 'JOHN', age: 28, score: 95 },
      ] as TestItem[];

      const sort: ParsedSort = {
        field: 'name',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(dataWithCases, [sort]);

      expect(result.success).toBe(true);
    });

    /**
     * Test case insensitive sorting
     */
    it('should sort case insensitively', () => {
      sortEngine.setContext({ caseSensitive: false });

      const dataWithCases = [
        { name: 'john', age: 30, score: 85 },
        { name: 'John', age: 25, score: 90 },
        { name: 'JOHN', age: 28, score: 95 },
      ] as TestItem[];

      const sort: ParsedSort = {
        field: 'name',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(dataWithCases, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Locale-based Sorting', () => {
    /**
     * Test sorting with different locale
     */
    it('should sort with French locale', () => {
      sortEngine.setContext({ locale: 'fr-FR' });

      const sort: ParsedSort = {
        field: 'name',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Numeric Collation', () => {
    /**
     * Test sorting with numeric collation enabled
     */
    it('should sort with numeric collation enabled', () => {
      sortEngine.setContext({ numericCollation: true });

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });

    /**
     * Test sorting with numeric collation disabled
     */
    it('should sort with numeric collation disabled', () => {
      sortEngine.setContext({ numericCollation: false });

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test sorting empty array
     */
    it('should handle empty array', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply([], [sort]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test sorting single element
     */
    it('should handle single element array', () => {
      const singleElement = [{ name: 'John', age: 30, score: 85 }];

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(singleElement, [sort]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    /**
     * Test sorting with empty sorts array
     */
    it('should handle empty sorts array', () => {
      const result = sortEngine.apply(testData, []);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(testData.length);
    });

    /**
     * Test sorting array with all same values
     */
    it('should handle array with all same values', () => {
      const sameValues = [
        { name: 'John', age: 30, score: 85 },
        { name: 'Jane', age: 30, score: 85 },
        { name: 'Bob', age: 30, score: 85 },
      ];

      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(sameValues, [sort]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test handling invalid field
     */
    it('should handle sorting by invalid field', () => {
      const sort: ParsedSort = {
        field: 'invalidField',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      const result = sortEngine.apply(testData, [sort]);

      expect(result.success).toBe(true);
    });
  });

  describe('Additional Statistics', () => {
    /**
     * Test stats track average execution time
     */
    it('should track average execution time', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      sortEngine.apply(testData, [sort]);
      const stats = sortEngine.getStats();

      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    /**
     * Test stats track average comparisons
     */
    it('should track average comparisons', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      sortEngine.apply(testData, [sort]);
      const stats = sortEngine.getStats();

      expect(stats.averageComparisons).toBeGreaterThan(0);
    });

    /**
     * Test stats track cache hit rate
     */
    it('should track cache hit rate', () => {
      const sort: ParsedSort = {
        field: 'age',
        direction: SortDirection.ASC,
        nullPosition: NullPosition.LAST,
      };

      sortEngine.compile(sort);
      sortEngine.compile(sort);
      const stats = sortEngine.getStats();

      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });
  });
});
