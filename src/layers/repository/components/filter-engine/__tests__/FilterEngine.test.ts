/**
 * Filter Engine Layer Tests
 * 
 * Comprehensive test suite for FilterEngine implementation.
 * Tests filter application, compilation, optimization, and statistics.
 */

import { FilterEngine } from '../implementations/FilterEngine';
import { IFilterEngine } from '../interfaces/IFilterEngine';
import { ParsedFilter, LogicalOperator } from '../../query-parser/types/query-parser-types';
import {
  NullHandling,
} from '../types/filter-engine-types';

interface TestItem {
  name: string;
  age: number;
  active: boolean;
}

describe('FilterEngine', () => {
  let filterEngine: FilterEngine<TestItem>;
  let testData: TestItem[];

  beforeEach(() => {
    // Initialize FilterEngine before each test
    filterEngine = new FilterEngine<TestItem>();
    testData = [
      { name: 'John', age: 30, active: true },
      { name: 'Jane', age: 25, active: false },
      { name: 'Bob', age: 35, active: true },
      { name: 'Alice', age: 28, active: false },
    ];
  });

  describe('Initialization', () => {
    /**
     * Test that FilterEngine initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = filterEngine.getConfig();
      expect(config.enableOptimization).toBe(true);
      expect(config.enableCompilation).toBe(true);
      expect(config.nullHandling).toBe(NullHandling.IGNORE);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = filterEngine.getStats();
      expect(stats.totalFiltersApplied).toBe(0);
      expect(stats.compiledFilters).toBe(0);
    });
  });

  describe('Filter Application', () => {
    /**
     * Test applying a simple filter
     */
    it('should apply a simple filter successfully', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].name).toBe('John');
    });

    /**
     * Test applying filter with gt operator
     */
    it('should apply filter with gt operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: 'gt',
        value: 30,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].age).toBe(35);
    });

    /**
     * Test applying multiple filters with AND
     */
    it('should apply multiple filters with AND', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: 'gt',
          value: 25,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'active',
          operator: 'eq',
          value: true,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const result = filterEngine.apply(testData, filters);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test applying multiple filters with OR
     */
    it('should apply multiple filters with OR', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: 'eq',
          value: 'John',
          logicalOperator: LogicalOperator.OR,
        },
        {
          field: 'name',
          operator: 'eq',
          value: 'Jane',
          logicalOperator: LogicalOperator.OR,
        },
      ];

      const result = filterEngine.apply(testData, filters);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test applying filter returns empty array when no matches
     */
    it('should return empty array when no matches', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: 'gt',
        value: 100,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });
  });

  describe('Filter Compilation', () => {
    /**
     * Test compiling a filter
     */
    it('should compile a filter successfully', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      const compiled = filterEngine.compileFilter(filter);

      expect(compiled).toBeDefined();
      expect(typeof compiled).toBe('function');
    });

    /**
     * Test applying compiled filter
     */
    it('should apply compiled filter correctly', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      const compiled = filterEngine.compileFilter(filter);
      const result = testData.filter(compiled);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('John');
    });
  });

  describe('Filter Optimization', () => {
    /**
     * Test getting optimization hints
     */
    it('should provide optimization hints', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      const hints = filterEngine.getOptimizationHints(filter);

      expect(hints).toBeDefined();
    });
  });

  describe('Null Handling', () => {
    /**
     * Test handling null values with IGNORE strategy
     */
    it('should handle null values with IGNORE strategy', () => {
      filterEngine.setConfig({
        ...filterEngine.getConfig(),
        nullHandling: NullHandling.IGNORE,
      });

      const dataWithNulls: (TestItem | null)[] = [
        { name: 'John', age: 30, active: true },
        null,
        { name: 'Jane', age: 25, active: false },
      ];

      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(dataWithNulls, [filter]);

      expect(result.success).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total filters applied
     */
    it('should track total filters applied', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      filterEngine.apply(testData, [filter]);

      const stats = filterEngine.getStats();
      expect(stats.totalFiltersApplied).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'eq',
        value: 'John',
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      filterEngine.resetStats();

      const stats = filterEngine.getStats();
      expect(stats.totalFiltersApplied).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableOptimization: false,
        enableCompilation: false,
        nullHandling: NullHandling.TREAT_AS_NULL,
      };

      filterEngine.setConfig(newConfig);
      const config = filterEngine.getConfig();

      expect(config.enableOptimization).toBe(false);
      expect(config.enableCompilation).toBe(false);
      expect(config.nullHandling).toBe(NullHandling.TREAT_AS_NULL);
    });
  });
});
