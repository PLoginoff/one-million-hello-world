/**
 * Query Builder Layer Tests
 * 
 * Comprehensive test suite for QueryBuilder implementation.
 * Tests query building, chaining, validation, and statistics.
 */

import { QueryBuilder } from '../implementations/QueryBuilder';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import { ParsedFilter, LogicalOperator, SortDirection } from '../../query-parser/types/query-parser-types';

describe('QueryBuilder', () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    // Initialize QueryBuilder before each test
    queryBuilder = new QueryBuilder();
  });

  describe('Initialization', () => {
    /**
     * Test that QueryBuilder initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = queryBuilder.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.maxFilters).toBe(100);
      expect(config.maxSorts).toBe(50);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = queryBuilder.getStats();
      expect(stats.totalQueriesBuilt).toBe(0);
    });
  });

  describe('Filter Building', () => {
    /**
     * Test adding a where clause
     */
    it('should add a where clause successfully', () => {
      const result = queryBuilder.where('name', 'eq', 'John');

      expect(result).toBe(queryBuilder);
      const filters = queryBuilder.getFilters();
      expect(filters.length).toBe(1);
    });

    /**
     * Test adding an andWhere clause
     */
    it('should add an andWhere clause successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      const result = queryBuilder.andWhere('age', 'gt', 30);

      expect(result).toBe(queryBuilder);
      const filters = queryBuilder.getFilters();
      expect(filters.length).toBe(2);
    });

    /**
     * Test adding an orWhere clause
     */
    it('should add an orWhere clause successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      const result = queryBuilder.orWhere('name', 'eq', 'Jane');

      expect(result).toBe(queryBuilder);
      const filters = queryBuilder.getFilters();
      expect(filters.length).toBe(2);
    });
  });

  describe('Sort Building', () => {
    /**
     * Test adding an orderBy clause
     */
    it('should add an orderBy clause successfully', () => {
      const result = queryBuilder.orderBy('name', SortDirection.ASC);

      expect(result).toBe(queryBuilder);
      const sorts = queryBuilder.getSorts();
      expect(sorts.length).toBe(1);
    });

    /**
     * Test adding multiple orderBy clauses
     */
    it('should add multiple orderBy clauses successfully', () => {
      queryBuilder.orderBy('name', SortDirection.ASC);
      queryBuilder.orderBy('age', SortDirection.DESC);

      const sorts = queryBuilder.getSorts();
      expect(sorts.length).toBe(2);
    });
  });

  describe('Pagination Building', () => {
    /**
     * Test setting limit
     */
    it('should set limit successfully', () => {
      const result = queryBuilder.limit(10);

      expect(result).toBe(queryBuilder);
      expect(queryBuilder.getLimit()).toBe(10);
    });

    /**
     * Test setting offset
     */
    it('should set offset successfully', () => {
      const result = queryBuilder.offset(20);

      expect(result).toBe(queryBuilder);
      expect(queryBuilder.getOffset()).toBe(20);
    });

    /**
     * Test setting both limit and offset
     */
    it('should set both limit and offset successfully', () => {
      queryBuilder.limit(10);
      queryBuilder.offset(20);

      expect(queryBuilder.getLimit()).toBe(10);
      expect(queryBuilder.getOffset()).toBe(20);
    });
  });

  describe('Query Building', () => {
    /**
     * Test building a complete query
     */
    it('should build a complete query successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', SortDirection.ASC);
      queryBuilder.limit(10);
      queryBuilder.offset(0);

      const query = queryBuilder.build();

      expect(query).toBeDefined();
      expect(query.filters.length).toBe(1);
      expect(query.sorts.length).toBe(1);
      expect(query.pagination).toBeDefined();
    });

    /**
     * Test building an empty query
     */
    it('should build an empty query successfully', () => {
      const query = queryBuilder.build();

      expect(query).toBeDefined();
      expect(query.filters.length).toBe(0);
      expect(query.sorts.length).toBe(0);
    });
  });

  describe('Query Reset', () => {
    /**
     * Test resetting the query builder
     */
    it('should reset the query builder successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', SortDirection.ASC);
      queryBuilder.limit(10);

      queryBuilder.reset();

      const filters = queryBuilder.getFilters();
      const sorts = queryBuilder.getSorts();
      const limit = queryBuilder.getLimit();
      const offset = queryBuilder.getOffset();

      expect(filters.length).toBe(0);
      expect(sorts.length).toBe(0);
      expect(limit).toBeUndefined();
      expect(offset).toBeUndefined();
    });
  });

  describe('Method Chaining', () => {
    /**
     * Test method chaining works correctly
     */
    it('should support method chaining', () => {
      const query = queryBuilder
        .where('name', 'eq', 'John')
        .andWhere('age', 'gt', 30)
        .orderBy('name', SortDirection.ASC)
        .limit(10)
        .offset(0)
        .build();

      expect(query).toBeDefined();
      expect(query.filters.length).toBe(2);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total queries built
     */
    it('should track total queries built', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.build();

      queryBuilder.where('age', 'gt', 30);
      queryBuilder.build();

      const stats = queryBuilder.getStats();
      expect(stats.totalQueriesBuilt).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.build();

      queryBuilder.resetStats();

      const stats = queryBuilder.getStats();
      expect(stats.totalQueriesBuilt).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableValidation: false,
        maxFilters: 50,
        maxSorts: 25,
      };

      queryBuilder.setConfig(newConfig);
      const config = queryBuilder.getConfig();

      expect(config.enableValidation).toBe(false);
      expect(config.maxFilters).toBe(50);
      expect(config.maxSorts).toBe(25);
    });
  });

  describe('Validation', () => {
    /**
     * Test validation with enabled validation
     */
    it('should validate query when validation is enabled', () => {
      queryBuilder.setConfig({ enableValidation: true, maxFilters: 100, maxSorts: 50 });
      queryBuilder.where('name', 'eq', 'John');

      const isValid = queryBuilder.validate();

      expect(isValid).toBe(true);
    });

    /**
     * Test validation fails when max filters exceeded
     */
    it('should fail validation when max filters exceeded', () => {
      queryBuilder.setConfig({ enableValidation: true, maxFilters: 2, maxSorts: 50 });
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.andWhere('age', 'gt', 30);
      queryBuilder.andWhere('active', 'eq', true);

      const isValid = queryBuilder.validate();

      expect(isValid).toBe(false);
    });
  });

  describe('Query Cloning', () => {
    /**
     * Test cloning a query builder
     */
    it('should clone the query builder successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', SortDirection.ASC);

      const cloned = queryBuilder.clone();

      cloned.where('age', 'gt', 30);

      expect(queryBuilder.getFilters().length).toBe(1);
      expect(cloned.getFilters().length).toBe(2);
    });
  });
});
