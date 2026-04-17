/**
 * Query Builder Layer Tests
 * 
 * Comprehensive test suite for QueryBuilder implementation.
 * Tests query building, chaining, projections, aggregations, joins, and state management.
 */

import { QueryBuilder } from '../implementations/QueryBuilder';
import { IQueryBuilder } from '../interfaces/IQueryBuilder';
import { JoinType } from '../types/query-builder-types';

describe('QueryBuilder', () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    queryBuilder = new QueryBuilder();
  });

  describe('Initialization', () => {
    /**
     * Test that QueryBuilder initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = queryBuilder.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.maxLimit).toBe(1000);
      expect(config.defaultLimit).toBe(100);
      expect(config.enableOptimization).toBe(true);
      expect(config.enableCaching).toBe(false);
    });

    /**
     * Test that state is initialized to empty
     */
    it('should initialize state to empty', () => {
      const state = queryBuilder.getState();
      expect(state.filters.length).toBe(0);
      expect(state.sorts.length).toBe(0);
      expect(state.projections.length).toBe(0);
      expect(state.groups.length).toBe(0);
      expect(state.aggregations.length).toBe(0);
      expect(state.having.length).toBe(0);
      expect(state.joins.length).toBe(0);
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
      expect(filters[0].field).toBe('name');
      expect(filters[0].logicalOperator).toBe('AND');
      expect(filters[0].negated).toBe(false);
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
      expect(filters[1].logicalOperator).toBe('OR');
    });

    /**
     * Test adding a notWhere clause
     */
    it('should add a notWhere clause successfully', () => {
      const result = queryBuilder.notWhere('active', 'eq', false);

      expect(result).toBe(queryBuilder);
      const filters = queryBuilder.getFilters();
      expect(filters.length).toBe(1);
      expect(filters[0].negated).toBe(true);
    });

    /**
     * Test hasFilters returns correct value
     */
    it('should return false for hasFilters when no filters', () => {
      expect(queryBuilder.hasFilters()).toBe(false);
    });

    /**
     * Test hasFilters returns true when filters exist
     */
    it('should return true for hasFilters when filters exist', () => {
      queryBuilder.where('name', 'eq', 'John');
      expect(queryBuilder.hasFilters()).toBe(true);
    });
  });

  describe('Sort Building', () => {
    /**
     * Test adding an orderBy clause
     */
    it('should add an orderBy clause successfully', () => {
      const result = queryBuilder.orderBy('name', 'ASC');

      expect(result).toBe(queryBuilder);
      const sorts = queryBuilder.getSorts();
      expect(sorts.length).toBe(1);
      expect(sorts[0].field).toBe('name');
      expect(sorts[0].direction).toBe('ASC');
    });

    /**
     * Test adding orderBy with nullPosition
     */
    it('should add orderBy with nullPosition', () => {
      const result = queryBuilder.orderBy('name', 'ASC', 'FIRST');

      expect(result).toBe(queryBuilder);
      const sorts = queryBuilder.getSorts();
      expect(sorts[0].nullPosition).toBe('FIRST');
    });

    /**
     * Test adding multiple orderBy clauses
     */
    it('should add multiple orderBy clauses successfully', () => {
      queryBuilder.orderBy('name', 'ASC');
      queryBuilder.orderBy('age', 'DESC');

      const sorts = queryBuilder.getSorts();
      expect(sorts.length).toBe(2);
    });

    /**
     * Test hasSorts returns correct value
     */
    it('should return false for hasSorts when no sorts', () => {
      expect(queryBuilder.hasSorts()).toBe(false);
    });

    /**
     * Test hasSorts returns true when sorts exist
     */
    it('should return true for hasSorts when sorts exist', () => {
      queryBuilder.orderBy('name', 'ASC');
      expect(queryBuilder.hasSorts()).toBe(true);
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
     * Test limit respects maxLimit
     */
    it('should respect maxLimit when setting limit', () => {
      queryBuilder.setConfig({ maxLimit: 50 });
      queryBuilder.limit(100);

      expect(queryBuilder.getLimit()).toBe(50);
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
     * Test offset handles negative values
     */
    it('should handle negative offset', () => {
      queryBuilder.offset(-10);
      expect(queryBuilder.getOffset()).toBe(0);
    });

    /**
     * Test setting cursor
     */
    it('should set cursor successfully', () => {
      const result = queryBuilder.cursor('abc123');

      expect(result).toBe(queryBuilder);
      expect(queryBuilder.getCursor()).toBe('abc123');
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

  describe('Projection Building', () => {
    /**
     * Test adding a select clause
     */
    it('should add a select clause successfully', () => {
      const result = queryBuilder.select('name');

      expect(result).toBe(queryBuilder);
      expect(queryBuilder.hasProjections()).toBe(true);
    });

    /**
     * Test adding select with alias
     */
    it('should add select with alias successfully', () => {
      const result = queryBuilder.select('name', 'fullName');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.projections[0].alias).toBe('fullName');
    });

    /**
     * Test adding select with function
     */
    it('should add select with function successfully', () => {
      const result = queryBuilder.select('name', undefined, 'UPPER');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.projections[0].function).toBe('UPPER');
    });

    /**
     * Test hasProjections returns correct value
     */
    it('should return false for hasProjections when no projections', () => {
      expect(queryBuilder.hasProjections()).toBe(false);
    });
  });

  describe('Grouping and Aggregation', () => {
    /**
     * Test adding a groupBy clause
     */
    it('should add a groupBy clause successfully', () => {
      const result = queryBuilder.groupBy('category');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.groups.length).toBe(1);
    });

    /**
     * Test adding an aggregate clause
     */
    it('should add an aggregate clause successfully', () => {
      const result = queryBuilder.aggregate('COUNT', 'id', 'total');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.aggregations.length).toBe(1);
      expect(state.aggregations[0].function).toBe('COUNT');
    });

    /**
     * Test adding aggregate without alias
     */
    it('should add aggregate without alias successfully', () => {
      const result = queryBuilder.aggregate('SUM', 'price');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.aggregations[0].alias).toBeUndefined();
    });
  });

  describe('Having Clause', () => {
    /**
     * Test adding a having clause
     */
    it('should add a having clause successfully', () => {
      const result = queryBuilder.having('count', 'gt', 5);

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.having.length).toBe(1);
    });
  });

  describe('Join Building', () => {
    /**
     * Test adding a join clause
     */
    it('should add a join clause successfully', () => {
      const result = queryBuilder.join(JoinType.INNER, 'users', 'u', [
        { left: 'id', right: 'userId', operator: 'eq' },
      ]);

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.joins.length).toBe(1);
      expect(state.joins[0].type).toBe(JoinType.INNER);
    });

    /**
     * Test adding join without conditions
     */
    it('should add join without conditions successfully', () => {
      const result = queryBuilder.join(JoinType.LEFT, 'users');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.joins[0].on).toEqual([]);
    });

    /**
     * Test adding join without alias
     */
    it('should add join without alias successfully', () => {
      const result = queryBuilder.join(JoinType.RIGHT, 'users');

      expect(result).toBe(queryBuilder);
      const state = queryBuilder.getState();
      expect(state.joins[0].alias).toBeUndefined();
    });
  });

  describe('Query Building', () => {
    /**
     * Test building a complete query
     */
    it('should build a complete query successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', 'ASC');
      queryBuilder.limit(10);
      queryBuilder.offset(0);

      const result = queryBuilder.build();

      expect(result.success).toBe(true);
      expect(result.query).toBeDefined();
    });

    /**
     * Test building an empty query
     */
    it('should build an empty query successfully', () => {
      const result = queryBuilder.build();

      expect(result.success).toBe(true);
      expect(result.query).toBeDefined();
    });

    /**
     * Test building with validation error
     */
    it('should return error when validation fails', () => {
      queryBuilder.limit(-10);

      const result = queryBuilder.build();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Query Reset', () => {
    /**
     * Test resetting the query builder
     */
    it('should reset the query builder successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', 'ASC');
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

    /**
     * Test reset returns query builder for chaining
     */
    it('should return query builder for chaining after reset', () => {
      const result = queryBuilder.reset();
      expect(result).toBe(queryBuilder);
    });
  });

  describe('Query Cloning', () => {
    /**
     * Test cloning a query builder
     */
    it('should clone the query builder successfully', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.orderBy('age', 'ASC');

      const cloned = queryBuilder.clone();

      cloned.where('age', 'gt', 30);

      expect(queryBuilder.getFilters().length).toBe(1);
      expect(cloned.getFilters().length).toBe(2);
    });

    /**
     * Test cloned query builder has same config
     */
    it('should clone with same configuration', () => {
      queryBuilder.setConfig({ maxLimit: 50 });
      const cloned = queryBuilder.clone();

      expect(cloned.getConfig().maxLimit).toBe(50);
    });
  });

  describe('State Management', () => {
    /**
     * Test getting state
     */
    it('should return current state', () => {
      queryBuilder.where('name', 'eq', 'John');
      queryBuilder.limit(10);

      const state = queryBuilder.getState();

      expect(state.filters.length).toBe(1);
      expect(state.pagination.limit).toBe(10);
    });

    /**
     * Test setting state
     */
    it('should set state successfully', () => {
      const newState = {
        filters: [{ field: 'age', operator: 'gt', value: 30, logicalOperator: 'AND', negated: false }],
        sorts: [],
        pagination: { limit: 20 },
        projections: [],
        groups: [],
        aggregations: [],
        having: [],
        joins: [],
      };

      queryBuilder.setState(newState);

      expect(queryBuilder.getFilters().length).toBe(1);
      expect(queryBuilder.getLimit()).toBe(20);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        maxLimit: 500,
        defaultLimit: 50,
        enableValidation: false,
        enableOptimization: false,
        enableCaching: true,
      };

      queryBuilder.setConfig(newConfig);
      const config = queryBuilder.getConfig();

      expect(config.maxLimit).toBe(500);
      expect(config.defaultLimit).toBe(50);
      expect(config.enableValidation).toBe(false);
      expect(config.enableOptimization).toBe(false);
      expect(config.enableCaching).toBe(true);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      queryBuilder.setConfig({ maxLimit: 500 });
      const config = queryBuilder.getConfig();

      expect(config.maxLimit).toBe(500);
      expect(config.enableValidation).toBe(true);
    });
  });

  describe('Method Chaining', () => {
    /**
     * Test method chaining works correctly
     */
    it('should support method chaining', () => {
      const result = queryBuilder
        .where('name', 'eq', 'John')
        .andWhere('age', 'gt', 30)
        .orderBy('name', 'ASC')
        .limit(10)
        .offset(0)
        .build();

      expect(result.success).toBe(true);
    });

    /**
     * Test complex chaining with all methods
     */
    it('should support complex chaining', () => {
      const result = queryBuilder
        .select('name', 'fullName')
        .where('active', 'eq', true)
        .andWhere('age', 'gt', 18)
        .orderBy('name', 'ASC')
        .groupBy('category')
        .aggregate('COUNT', 'id', 'total')
        .limit(10)
        .offset(0)
        .build();

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test building with disabled validation
     */
    it('should build with disabled validation', () => {
      queryBuilder.setConfig({ enableValidation: false });
      queryBuilder.limit(-10);

      const result = queryBuilder.build();

      expect(result.success).toBe(true);
    });

    /**
     * Test multiple builds on same builder
     */
    it('should support multiple builds', () => {
      queryBuilder.where('name', 'eq', 'John');
      const result1 = queryBuilder.build();

      queryBuilder.andWhere('age', 'gt', 30);
      const result2 = queryBuilder.build();

      expect(result1.query?.filters.length).toBe(1);
      expect(result2.query?.filters.length).toBe(2);
    });
  });
});
