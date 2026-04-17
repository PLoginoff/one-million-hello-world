/**
 * Filter Engine Layer Tests
 * 
 * Comprehensive test suite for FilterEngine implementation.
 * Tests filter application, compilation, optimization, and statistics.
 */

import { FilterEngine } from '../implementations/FilterEngine';
import { IFilterEngine } from '../interfaces/IFilterEngine';
import { ParsedFilter, LogicalOperator, FilterOperator } from '../../query-parser/types/query-parser-types';
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
      const chainConfig = filterEngine.getChainConfig();
      const context = filterEngine.getContext();
      expect(chainConfig.shortCircuitEvaluation).toBe(true);
      expect(chainConfig.parallelExecution).toBe(false);
      expect(context.nullHandling).toBe(NullHandling.IGNORE);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = filterEngine.getStats();
      expect(stats.totalFilters).toBe(0);
      expect(stats.appliedFilters).toBe(0);
    });
  });

  describe('Filter Application', () => {
    /**
     * Test applying a simple filter
     */
    it('should apply a simple filter successfully', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
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
        operator: FilterOperator.GREATER_THAN,
        value: 30,
        negated: false,
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
          operator: FilterOperator.GREATER_THAN,
          value: 25,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'active',
          operator: FilterOperator.EQUALS,
          value: true,
          negated: false,
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
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.OR,
        },
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'Jane',
          negated: false,
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
        operator: FilterOperator.GREATER_THAN,
        value: 100,
        negated: false,
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
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const compiled = filterEngine.compile(filter);

      expect(compiled).toBeDefined();
      expect(typeof compiled.predicate).toBe('function');
    });

    /**
     * Test applying compiled filter
     */
    it('should apply compiled filter correctly', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const compiled = filterEngine.compile(filter);
      const result = testData.filter(compiled.predicate);

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
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const hints = filterEngine.getOptimizationHints([filter]);

      expect(hints).toBeDefined();
    });
  });

  describe('Null Handling', () => {
    /**
     * Test handling null values with IGNORE strategy
     */
    it('should handle null values with IGNORE strategy', () => {
      filterEngine.setContext({
        ...filterEngine.getContext(),
        nullHandling: NullHandling.IGNORE,
      });

      const dataWithNulls: (TestItem | null)[] = [
        { name: 'John', age: 30, active: true },
        null,
        { name: 'Jane', age: 25, active: false },
      ];

      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(dataWithNulls as TestItem[], [filter]);

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
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      filterEngine.apply(testData, [filter]);

      const stats = filterEngine.getStats();
      expect(stats.totalFilters).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      filterEngine.resetStats();

      const stats = filterEngine.getStats();
      expect(stats.totalFilters).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      filterEngine.setChainConfig({
        shortCircuitEvaluation: false,
        parallelExecution: true,
      });
      filterEngine.setContext({
        nullHandling: NullHandling.TREAT_AS_MATCH,
      });

      const chainConfig = filterEngine.getChainConfig();
      const context = filterEngine.getContext();

      expect(chainConfig.shortCircuitEvaluation).toBe(false);
      expect(chainConfig.parallelExecution).toBe(true);
      expect(context.nullHandling).toBe(NullHandling.TREAT_AS_MATCH);
    });
  });

  describe('All Filter Operators', () => {
    /**
     * Test EQUALS operator
     */
    it('should apply EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].name).toBe('John');
    });

    /**
     * Test NOT_EQUALS operator
     */
    it('should apply NOT_EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.NOT_EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
      expect(result.data?.every((item) => item.name !== 'John')).toBe(true);
    });

    /**
     * Test CONTAINS operator
     */
    it('should apply CONTAINS operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.CONTAINS,
        value: 'J',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test STARTS_WITH operator
     */
    it('should apply STARTS_WITH operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.STARTS_WITH,
        value: 'J',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test ENDS_WITH operator
     */
    it('should apply ENDS_WITH operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.ENDS_WITH,
        value: 'e',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test GREATER_THAN operator
     */
    it('should apply GREATER_THAN operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN,
        value: 30,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(result.data?.[0].age).toBe(35);
    });

    /**
     * Test LESS_THAN operator
     */
    it('should apply LESS_THAN operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.LESS_THAN,
        value: 30,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test GREATER_THAN_OR_EQUALS operator
     */
    it('should apply GREATER_THAN_OR_EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN_OR_EQUALS,
        value: 30,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test LESS_THAN_OR_EQUALS operator
     */
    it('should apply LESS_THAN_OR_EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.LESS_THAN_OR_EQUALS,
        value: 30,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
    });

    /**
     * Test IN operator
     */
    it('should apply IN operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.IN,
        value: [25, 30],
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test NOT_IN operator
     */
    it('should apply NOT_IN operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.NOT_IN,
        value: [25, 30],
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });


  });

  describe('Filter Negation', () => {
    /**
     * Test negating a filter
     */
    it('should negate a filter correctly', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const negated = filterEngine.negate(filter);

      expect(negated.negated).toBe(true);
      expect(negated.field).toBe(filter.field);
      expect(negated.operator).toBe(filter.operator);
    });

    /**
     * Test applying negated filter
     */
    it('should apply negated filter correctly', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: true,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
      expect(result.data?.every((item) => item.name !== 'John')).toBe(true);
    });
  });

  describe('Filter Combination', () => {
    /**
     * Test combining filters with AND
     */
    it('should combine filters with AND', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 25,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'active',
          operator: FilterOperator.EQUALS,
          value: true,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const combined = filterEngine.combine(filters, 'AND');

      expect(combined).toBeDefined();
    });

    /**
     * Test combining filters with OR
     */
    it('should combine filters with OR', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.OR,
        },
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'Jane',
          negated: false,
          logicalOperator: LogicalOperator.OR,
        },
      ];

      const combined = filterEngine.combine(filters, 'OR');

      expect(combined).toBeDefined();
    });

    /**
     * Test combining single filter returns same filter
     */
    it('should return same filter when combining single filter', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const combined = filterEngine.combine(filters, 'AND');

      expect(combined).toBe(filters[0]);
    });

    /**
     * Test combining empty filters throws error
     */
    it('should throw error when combining empty filters', () => {
      const filters: ParsedFilter[] = [];

      expect(() => filterEngine.combine(filters, 'AND')).toThrow();
    });
  });

  describe('Filter Validation', () => {
    /**
     * Test valid filter passes validation
     */
    it('should validate a valid filter', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const isValid = filterEngine.validate(filter);

      expect(isValid).toBe(true);
    });

    /**
     * Test invalid filter without field fails validation
     */
    it('should fail validation for filter without field', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN,
        value: 30,
        negated: false,
        logicalOperator: LogicalOperator.OR,
      };

      const isValid = filterEngine.validate(filter);

      expect(isValid).toBe(false);
    });

    /**
     * Test invalid filter without operator fails validation
     */
    it('should fail validation for filter without operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: '',
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const isValid = filterEngine.validate(filter);

      expect(isValid).toBe(false);
    });
  });

  describe('Compiled Filter Application', () => {
    /**
     * Test applying compiled filters
     */
    it('should apply compiled filters correctly', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const compiled = filters.map((f) => filterEngine.compile(f));
      const result = filterEngine.applyCompiled(testData, compiled);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    /**
     * Test compiled filter caching
     */
    it('should cache compiled filters', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const compiled1 = filterEngine.compile(filter);
      const compiled2 = filterEngine.compile(filter);

      expect(compiled1).toBe(compiled2);
    });
  });

  describe('Selectivity Estimation', () => {
    /**
     * Test estimate selectivity for EQUALS
     */
    it('should estimate selectivity for EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 100);

      expect(selectivity).toBe(0.01);
    });

    /**
     * Test estimate selectivity for NOT_EQUALS
     */
    it('should estimate selectivity for NOT_EQUALS operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.NOT_EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 100);

      expect(selectivity).toBe(0.99);
    });

    /**
     * Test estimate selectivity for IN
     */
    it('should estimate selectivity for IN operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.IN,
        value: ['John', 'Jane'],
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 100);

      expect(selectivity).toBe(0.02);
    });

    /**
     * Test estimate selectivity for NOT_IN
     */
    it('should estimate selectivity for NOT_IN operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.NOT_IN,
        value: ['John', 'Jane'],
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 100);

      expect(selectivity).toBe(0.98);
    });

    /**
     * Test estimate selectivity for unknown operator
     */
    it('should estimate selectivity for unknown operator', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN,
        value: 25,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 100);

      expect(selectivity).toBe(0.5);
    });

    /**
     * Test estimate selectivity with zero total count
     */
    it('should return 0 selectivity for zero total count', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const selectivity = filterEngine.estimateSelectivity(filter, 0);

      expect(selectivity).toBe(0);
    });
  });

  describe('Optimization Hints', () => {
    /**
     * Test getting optimization hints for filters
     */
    it('should provide optimization hints for filters', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const hints = filterEngine.getOptimizationHints(filters);

      expect(hints).toBeDefined();
      expect(hints.length).toBe(1);
      expect(hints[0].recommendedIndex).toBe(true);
    });

    /**
     * Test optimization hints for IN operator
     */
    it('should recommend index for IN operator', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.IN,
          value: ['John', 'Jane'],
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const hints = filterEngine.getOptimizationHints(filters);

      expect(hints[0].recommendedIndex).toBe(true);
    });

    /**
     * Test optimization hints for non-indexable operators
     */
    it('should not recommend index for non-indexable operators', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'name',
          operator: FilterOperator.CONTAINS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const hints = filterEngine.getOptimizationHints(filters);

      expect(hints[0].recommendedIndex).toBe(false);
    });
  });

  describe('Context Management', () => {
    /**
     * Test setting context
     */
    it('should set filter context', () => {
      filterEngine.setContext({
        caseSensitive: true,
        nullHandling: NullHandling.TREAT_AS_MATCH,
        locale: 'fr-FR',
        timeZone: 'Europe/Paris',
      });

      const context = filterEngine.getContext();

      expect(context.caseSensitive).toBe(true);
      expect(context.nullHandling).toBe(NullHandling.TREAT_AS_MATCH);
      expect(context.locale).toBe('fr-FR');
      expect(context.timeZone).toBe('Europe/Paris');
    });

    /**
     * Test getting context returns copy
     */
    it('should return copy of context', () => {
      const context1 = filterEngine.getContext();
      filterEngine.setContext({ caseSensitive: true });
      const context2 = filterEngine.getContext();

      expect(context1.caseSensitive).toBe(false);
      expect(context2.caseSensitive).toBe(true);
    });
  });

  describe('Chain Configuration', () => {
    /**
     * Test setting chain config
     */
    it('should set chain configuration', () => {
      filterEngine.setChainConfig({
        shortCircuitEvaluation: false,
        parallelExecution: true,
        maxConcurrentFilters: 20,
      });

      const config = filterEngine.getChainConfig();

      expect(config.shortCircuitEvaluation).toBe(false);
      expect(config.parallelExecution).toBe(true);
      expect(config.maxConcurrentFilters).toBe(20);
    });

    /**
     * Test getting chain config returns copy
     */
    it('should return copy of chain config', () => {
      const config1 = filterEngine.getChainConfig();
      filterEngine.setChainConfig({ shortCircuitEvaluation: false });
      const config2 = filterEngine.getChainConfig();

      expect(config1.shortCircuitEvaluation).toBe(true);
      expect(config2.shortCircuitEvaluation).toBe(false);
    });
  });

  describe('Cache Management', () => {
    /**
     * Test clearing cache
     */
    it('should clear compiled filter cache', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.compile(filter);
      filterEngine.clearCache();

      const compiled = filterEngine.compile(filter);

      expect(compiled).toBeDefined();
    });
  });

  describe('Short Circuit Evaluation', () => {
    /**
     * Test short circuit evaluation stops early
     */
    it('should stop evaluation when result is empty with short circuit', () => {
      filterEngine.setChainConfig({ shortCircuitEvaluation: true });

      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 100,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      filterEngine.apply(testData, filters);
      const stats = filterEngine.getStats();

      expect(stats.skippedFilters).toBeGreaterThan(0);
    });

    /**
     * Test short circuit disabled applies all filters
     */
    it('should apply all filters when short circuit is disabled', () => {
      filterEngine.setChainConfig({ shortCircuitEvaluation: false });

      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 100,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      filterEngine.apply(testData, filters);
      const stats = filterEngine.getStats();

      expect(stats.skippedFilters).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test filtering empty data
     */
    it('should handle empty data array', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply([], [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test filtering with empty filters
     */
    it('should handle empty filters array', () => {
      const result = filterEngine.apply(testData, []);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(testData.length);
    });

    /**
     * Test filtering with null field values
     */
    it('should handle null field values', () => {
      const dataWithNulls = [
        { name: 'John', age: 30, active: true },
        { name: null, age: 25, active: false },
        { name: 'Jane', age: 28, active: true },
      ] as TestItem[];

      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(dataWithNulls, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    /**
     * Test filtering with undefined field values
     */
    it('should handle undefined field values', () => {
      const dataWithUndefined = [
        { name: 'John', age: 30, active: true },
        { age: 25, active: false },
        { name: 'Jane', age: 28, active: true },
      ] as TestItem[];

      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(dataWithUndefined, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    /**
     * Test boolean field filtering
     */
    it('should filter boolean fields correctly', () => {
      const filter: ParsedFilter = {
        field: 'active',
        operator: FilterOperator.EQUALS,
        value: true,
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
      expect(result.data?.every((item) => item.active === true)).toBe(true);
    });

    /**
     * Test case sensitive filtering
     */
    it('should handle case sensitive filtering', () => {
      filterEngine.setContext({ caseSensitive: true });

      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'john',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test case insensitive filtering
     */
    it('should handle case insensitive filtering', () => {
      filterEngine.setContext({ caseSensitive: false });

      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'john',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error handling for invalid field
     */
    it('should handle error for invalid field', () => {
      const filter: ParsedFilter = {
        field: 'invalidField',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
    });

    /**
     * Test error handling for invalid operator
     */
    it('should handle error for invalid operator', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: 'INVALID' as FilterOperator,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    /**
     * Test stats track total filters
     */
    it('should track total filters', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      const stats = filterEngine.getStats();

      expect(stats.totalFilters).toBe(1);
    });

    /**
     * Test stats track applied filters
     */
    it('should track applied filters', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      const stats = filterEngine.getStats();

      expect(stats.appliedFilters).toBe(1);
    });

    /**
     * Test stats track skipped filters
     */
    it('should track skipped filters', () => {
      filterEngine.setChainConfig({ shortCircuitEvaluation: true });

      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 100,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: 'John',
          logicalOperator: LogicalOperator.AND,
        },
      ];

      filterEngine.apply(testData, filters);
      const stats = filterEngine.getStats();

      expect(stats.skippedFilters).toBeGreaterThan(0);
    });

    /**
     * Test stats track average execution time
     */
    it('should track average execution time', () => {
      const filter: ParsedFilter = {
        field: 'name',
        operator: FilterOperator.EQUALS,
        value: 'John',
        negated: false,
        logicalOperator: LogicalOperator.AND,
      };

      filterEngine.apply(testData, [filter]);
      const stats = filterEngine.getStats();

      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Complex Filter Scenarios', () => {
    /**
     * Test multiple filters on same field
     */
    it('should handle multiple filters on same field', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 25,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'age',
          operator: FilterOperator.LESS_THAN,
          value: 35,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const result = filterEngine.apply(testData, filters);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test filters on different fields with AND
     */
    it('should handle filters on different fields with AND', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 25,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
        {
          field: 'active',
          operator: FilterOperator.EQUALS,
          value: true,
          negated: false,
          logicalOperator: LogicalOperator.AND,
        },
      ];

      const result = filterEngine.apply(testData, filters);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
    });

    /**
     * Test filters on different fields with OR
     */
    it('should handle filters on different fields with OR', () => {
      const filters: ParsedFilter[] = [
        {
          field: 'age',
          operator: FilterOperator.GREATER_THAN,
          value: 30,
          negated: false,
          logicalOperator: LogicalOperator.OR,
        },
        {
          field: 'active',
          operator: FilterOperator.EQUALS,
          value: true,
          negated: false,
          logicalOperator: LogicalOperator.OR,
        },
      ];

      const result = filterEngine.apply(testData, filters);

      expect(result.success).toBe(true);
    });

    /**
     * Test negated filter with complex condition
     */
    it('should handle negated filter with complex condition', () => {
      const filter: ParsedFilter = {
        field: 'age',
        operator: FilterOperator.GREATER_THAN,
        value: 30,
        negated: true,
        logicalOperator: LogicalOperator.AND,
      };

      const result = filterEngine.apply(testData, [filter]);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
    });
  });
});
