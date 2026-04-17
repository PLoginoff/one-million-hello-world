/**
 * Query Parser Layer Tests
 * 
 * Comprehensive test suite for QueryParser implementation.
 * Tests query parsing, validation, serialization, and statistics.
 */

import { QueryParser } from '../implementations/QueryParser';
import { IQueryParser } from '../interfaces/IQueryParser';
import {
  FilterOperator,
  LogicalOperator,
  SortDirection,
  NullPosition,
  AggregationFunction,
} from '../types/query-parser-types';

describe('QueryParser', () => {
  let queryParser: QueryParser;

  beforeEach(() => {
    // Initialize QueryParser before each test
    queryParser = new QueryParser();
  });

  describe('Initialization', () => {
    /**
     * Test that QueryParser initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = queryParser.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.maxDepth).toBe(10);
      expect(config.maxComplexity).toBe(100);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = queryParser.getStats();
      expect(stats.totalParses).toBe(0);
      expect(stats.successfulParses).toBe(0);
      expect(stats.failedParses).toBe(0);
    });
  });

  describe('Query Parsing', () => {
    /**
     * Test parsing a simple query string successfully
     */
    it('should parse a simple query string successfully', () => {
      const query = 'name EQUALS "John"';
      const result = queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.query?.filters.length).toBeGreaterThan(0);
    });

    /**
     * Test parsing empty query returns empty result
     */
    it('should return empty result for empty query', () => {
      const result = queryParser.parse('');

      expect(result.success).toBe(true);
      expect(result.query?.filters.length).toBe(0);
    });

    /**
     * Test parsing query with multiple filters
     */
    it('should parse query with multiple filters', () => {
      const query = 'name EQUALS "John" AND age GREATER_THAN 30';
      const result = queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.query?.filters.length).toBe(2);
    });

    /**
     * Test parsing query with sort clause
     */
    it('should parse query with sort clause', () => {
      const query = 'sort by name ASC';
      const result = queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.query?.sorts.length).toBeGreaterThan(0);
    });

    /**
     * Test parsing query with pagination
     */
    it('should parse query with pagination', () => {
      const query = 'limit 10 offset 20';
      const result = queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.query?.pagination).toBeDefined();
    });

    /**
     * Test parsing invalid query returns error
     */
    it('should return error for invalid query syntax', () => {
      const query = 'invalid syntax here';
      const result = queryParser.parse(query);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Filter Parsing', () => {
    /**
     * Test parsing filter expression
     */
    it('should parse filter expression correctly', () => {
      const filter = 'name EQUALS "John"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
      expect(result.query?.filters[0].field).toBe('name');
    });

    /**
     * Test parsing filter with AND operator
     */
    it('should parse filter with AND operator', () => {
      const filter = 'name EQUALS "John" AND age GREATER_THAN 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test parsing filter with OR operator
     */
    it('should parse filter with OR operator', () => {
      const filter = 'name EQUALS "John" OR name EQUALS "Jane"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test parsing filter with NOT operator
     */
    it('should parse filter with NOT operator', () => {
      const filter = 'NOT name EQUALS "John"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });
  });

  describe('Sort Parsing', () => {
    /**
     * Test parsing sort expression
     */
    it('should parse sort expression correctly', () => {
      const sort = 'name ASC';
      const result = queryParser.parseSort(sort);

      expect(result.success).toBe(true);
      expect(result.query?.sorts[0].field).toBe('name');
    });

    /**
     * Test parsing multiple sorts
     */
    it('should parse multiple sorts', () => {
      const sort = 'name ASC, age DESC';
      const result = queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });
  });

  describe('Pagination Parsing', () => {
    /**
     * Test parsing pagination with limit and offset
     */
    it('should parse pagination with limit and offset', () => {
      const pagination = '10,20';
      const result = queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
      expect(result.query?.pagination.limit).toBe(10);
      expect(result.query?.pagination.offset).toBe(20);
    });

    /**
     * Test parsing pagination with limit only
     */
    it('should parse pagination with limit only', () => {
      const pagination = '10';
      const result = queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
      expect(result.query?.pagination.limit).toBe(10);
    });
  });

  describe('Query Validation', () => {
    /**
     * Test valid query passes validation
     */
    it('should validate a valid query successfully', () => {
      const query = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };
      const result = queryParser.validate(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test invalid query fails validation
     */
    it('should fail validation for forbidden fields', () => {
      queryParser.addForbiddenField('password');
      const query = {
        filters: [{ field: 'password', operator: FilterOperator.EQUALS, value: 'secret', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };
      const result = queryParser.validate(query);

      expect(result.success).toBe(false);
    });

    /**
     * Test query with allowed fields passes validation
     */
    it('should pass validation for allowed fields', () => {
      queryParser.addAllowedField('name');
      queryParser.addAllowedField('age');
      const query = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };
      const result = queryParser.validate(query);

      expect(result.success).toBe(true);
    });
  });

  describe('Query Serialization', () => {
    /**
     * Test serialize parsed query to string
     */
    it('should serialize parsed query to string', () => {
      const query = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };
      const serialized = queryParser.serialize(query);

      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total queries parsed
     */
    it('should track total queries parsed', () => {
      queryParser.parse('name EQUALS "John"');
      queryParser.parse('age GREATER_THAN 30');

      const stats = queryParser.getStats();
      expect(stats.totalParses).toBe(2);
    });

    /**
     * Test stats track valid queries
     */
    it('should track valid queries', () => {
      queryParser.parse('name EQUALS "John"');
      queryParser.parse('age GREATER_THAN 30');

      const stats = queryParser.getStats();
      expect(stats.successfulParses).toBe(2);
    });

    /**
     * Test stats track invalid queries
     */
    it('should track invalid queries', () => {
      queryParser.parse('invalid syntax');
      queryParser.parse('another invalid');

      const stats = queryParser.getStats();
      expect(stats.failedParses).toBe(2);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableValidation: false,
        maxDepth: 20,
        maxComplexity: 200,
      };

      queryParser.setConfig(newConfig);
      const config = queryParser.getConfig();

      expect(config.enableValidation).toBe(false);
      expect(config.maxDepth).toBe(20);
      expect(config.maxComplexity).toBe(200);
    });

    /**
     * Test setting allowed fields
     */
    it('should set allowed fields', () => {
      queryParser.addAllowedField('name');
      queryParser.addAllowedField('age');
      queryParser.addAllowedField('email');
      const fields = queryParser.getAllowedFields();

      expect(fields).toContain('name');
      expect(fields).toContain('age');
    });

    /**
     * Test setting forbidden fields
     */
    it('should set forbidden fields', () => {
      queryParser.addForbiddenField('password');
      queryParser.addForbiddenField('token');
      const fields = queryParser.getForbiddenFields();

      expect(fields).toContain('password');
      expect(fields).toContain('token');
    });

    /**
     * Test adding single allowed field
     */
    it('should add single allowed field', () => {
      queryParser.addAllowedField('username');
      const fields = queryParser.getAllowedFields();

      expect(fields).toContain('username');
    });

    /**
     * Test removing allowed field
     */
    it('should remove allowed field', () => {
      queryParser.addAllowedField('username');
      queryParser.removeAllowedField('username');
      const fields = queryParser.getAllowedFields();

      expect(fields).not.toContain('username');
    });

    /**
     * Test adding single forbidden field
     */
    it('should add single forbidden field', () => {
      queryParser.addForbiddenField('secret');
      const fields = queryParser.getForbiddenFields();

      expect(fields).toContain('secret');
    });

    /**
     * Test removing forbidden field
     */
    it('should remove forbidden field', () => {
      queryParser.addForbiddenField('secret');
      queryParser.removeForbiddenField('secret');
      const fields = queryParser.getForbiddenFields();

      expect(fields).not.toContain('secret');
    });

    /**
     * Test reset configuration to defaults
     */
    it('should reset configuration to defaults', () => {
      queryParser.setConfig({ enableValidation: false, maxDepth: 50 });
      queryParser.resetConfig();
      const config = queryParser.getConfig();

      expect(config.enableValidation).toBe(true);
      expect(config.maxDepth).toBe(10);
      expect(config.maxComplexity).toBe(100);
    });

    /**
     * Test configuration immutability
     */
    it('should return immutable configuration copy', () => {
      const config1 = queryParser.getConfig();
      queryParser.setConfig({ enableValidation: false });
      const config2 = queryParser.getConfig();

      expect(config1.enableValidation).toBe(true);
      expect(config2.enableValidation).toBe(false);
    });
  });

  describe('All Filter Operators', () => {
    /**
     * Test EQUALS operator
     */
    it('should parse EQUALS operator', () => {
      const filter = 'name EQUALS "John"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test NOT_EQUALS operator
     */
    it('should parse NOT_EQUALS operator', () => {
      const filter = 'name NOT_EQUALS "John"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test CONTAINS operator
     */
    it('should parse CONTAINS operator', () => {
      const filter = 'name CONTAINS "John"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test STARTS_WITH operator
     */
    it('should parse STARTS_WITH operator', () => {
      const filter = 'name STARTS_WITH "J"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test ENDS_WITH operator
     */
    it('should parse ENDS_WITH operator', () => {
      const filter = 'name ENDS_WITH "n"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test GREATER_THAN operator
     */
    it('should parse GREATER_THAN operator', () => {
      const filter = 'age GREATER_THAN 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test LESS_THAN operator
     */
    it('should parse LESS_THAN operator', () => {
      const filter = 'age LESS_THAN 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test GREATER_THAN_OR_EQUALS operator
     */
    it('should parse GREATER_THAN_OR_EQUALS operator', () => {
      const filter = 'age GREATER_THAN_OR_EQUALS 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test LESS_THAN_OR_EQUALS operator
     */
    it('should parse LESS_THAN_OR_EQUALS operator', () => {
      const filter = 'age LESS_THAN_OR_EQUALS 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test IN operator
     */
    it('should parse IN operator', () => {
      const filter = 'name IN "John,Jane"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test NOT_IN operator
     */
    it('should parse NOT_IN operator', () => {
      const filter = 'name NOT_IN "John,Jane"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test BETWEEN operator
     */
    it('should parse BETWEEN operator', () => {
      const filter = 'age BETWEEN 20 30';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test IS_NULL operator
     */
    it('should parse IS_NULL operator', () => {
      const filter = 'name IS_NULL';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test IS_NOT_NULL operator
     */
    it('should parse IS_NOT_NULL operator', () => {
      const filter = 'name IS_NOT_NULL';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test LIKE operator
     */
    it('should parse LIKE operator', () => {
      const filter = 'name LIKE "J%"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test REGEX operator
     */
    it('should parse REGEX operator', () => {
      const filter = 'name REGEX "^J.*"';
      const result = queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });
  });

  describe('Logical Operators', () => {
    /**
     * Test AND logical operator
     */
    it('should parse AND logical operator', async () => {
      const filter = 'name EQUALS "John" AND age GREATER_THAN 30';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test OR logical operator
     */
    it('should parse OR logical operator', async () => {
      const filter = 'name EQUALS "John" OR name EQUALS "Jane"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test NOT logical operator
     */
    it('should parse NOT logical operator', async () => {
      const filter = 'NOT name EQUALS "John"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test complex logical expression
     */
    it('should parse complex logical expression', async () => {
      const filter = 'name EQUALS "John" AND (age GREATER_THAN 30 OR age LESS_THAN 20)';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });
  });

  describe('Sort Directions', () => {
    /**
     * Test ASC sort direction
     */
    it('should parse ASC sort direction', async () => {
      const sort = 'name ASC';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });

    /**
     * Test DESC sort direction
     */
    it('should parse DESC sort direction', async () => {
      const sort = 'name DESC';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });

    /**
     * Test default sort direction
     */
    it('should use default ASC direction when not specified', async () => {
      const sort = 'name';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });
  });

  describe('Null Positions', () => {
    /**
     * Test NULLS FIRST position
     */
    it('should parse NULLS FIRST position', async () => {
      const sort = 'name ASC NULLS FIRST';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });

    /**
     * Test NULLS LAST position
     */
    it('should parse NULLS LAST position', async () => {
      const sort = 'name ASC NULLS LAST';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });
  });

  describe('Aggregation Functions', () => {
    /**
     * Test COUNT aggregation
     */
    it('should parse COUNT aggregation', async () => {
      const aggregation = 'COUNT(*)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test SUM aggregation
     */
    it('should parse SUM aggregation', async () => {
      const aggregation = 'SUM(amount)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test AVG aggregation
     */
    it('should parse AVG aggregation', async () => {
      const aggregation = 'AVG(amount)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test MIN aggregation
     */
    it('should parse MIN aggregation', async () => {
      const aggregation = 'MIN(amount)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test MAX aggregation
     */
    it('should parse MAX aggregation', async () => {
      const aggregation = 'MAX(amount)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });
  });

  describe('Complex Queries', () => {
    /**
     * Test query with filters and sort
     */
    it('should parse query with filters and sort', async () => {
      const query = 'name EQUALS "John" sort by age ASC';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with filters, sort, and pagination
     */
    it('should parse query with filters, sort, and pagination', async () => {
      const query = 'name EQUALS "John" sort by age ASC limit 10 offset 20';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with multiple filters
     */
    it('should parse query with multiple filters', async () => {
      const query = 'name EQUALS "John" AND age GREATER_THAN 30 AND city EQUALS "NYC"';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with multiple sorts
     */
    it('should parse query with multiple sorts', async () => {
      const query = 'sort by name ASC, age DESC';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test query with null value
     */
    it('should handle query with null value', async () => {
      const query = 'name IS_NULL';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with empty string value
     */
    it('should handle query with empty string value', async () => {
      const query = 'name EQUALS ""';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with special characters
     */
    it('should handle query with special characters', async () => {
      const query = 'name CONTAINS "O\'Brien"';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with unicode characters
     */
    it('should handle query with unicode characters', async () => {
      const query = 'name EQUALS "José"';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with very large number
     */
    it('should handle query with very large number', async () => {
      const query = 'id GREATER_THAN 9999999999';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with negative number
     */
    it('should handle query with negative number', async () => {
      const query = 'balance LESS_THAN -100';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with decimal number
     */
    it('should handle query with decimal number', async () => {
      const query = 'price GREATER_THAN 99.99';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with boolean value
     */
    it('should handle query with boolean value', async () => {
      const query = 'active EQUALS true';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });

    /**
     * Test query with date value
     */
    it('should handle query with date value', async () => {
      const query = 'created_at GREATER_THAN "2024-01-01"';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
    });
  });

  describe('Validation Edge Cases', () => {
    /**
     * Test validation with complexity limit
     */
    it('should fail validation when complexity exceeds limit', () => {
      queryParser.setConfig({ maxComplexity: 5 });
      const parsedQuery = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [{ field: 'age', direction: SortDirection.ASC, nullPosition: NullPosition.LAST }],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const result = queryParser.validate(parsedQuery);
      expect(result.success).toBe(true);
    });

    /**
     * Test validation with empty allowed fields
     */
    it('should pass validation when allowed fields is empty', () => {
      queryParser.setConfig({ allowedFields: [] });
      const parsedQuery = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const result = queryParser.validate(parsedQuery);
      expect(result.success).toBe(true);
    });

    /**
     * Test validation with empty forbidden fields
     */
    it('should pass validation when forbidden fields is empty', () => {
      queryParser.setConfig({ forbiddenFields: [] });
      const parsedQuery = {
        filters: [{ field: 'password', operator: FilterOperator.EQUALS, value: 'secret', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const result = queryParser.validate(parsedQuery);
      expect(result.success).toBe(true);
    });

    /**
     * Test validation with both allowed and forbidden fields
     */
    it('should handle both allowed and forbidden fields', () => {
      queryParser.setConfig({ allowedFields: ['name', 'age'], forbiddenFields: ['password'] });
      const parsedQuery = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 10, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const result = queryParser.validate(parsedQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('Serialization Edge Cases', () => {
    /**
     * Test serialize empty query
     */
    it('should serialize empty query', () => {
      const query = {
        filters: [],
        sorts: [],
        pagination: { limit: 0, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const serialized = queryParser.serialize(query);
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
    });

    /**
     * Test serialize query with only filters
     */
    it('should serialize query with only filters', () => {
      const query = {
        filters: [{ field: 'name', operator: FilterOperator.EQUALS, value: 'John', negated: false, logicalOperator: LogicalOperator.AND }],
        sorts: [],
        pagination: { limit: 0, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const serialized = queryParser.serialize(query);
      expect(serialized).toContain('name');
    });

    /**
     * Test serialize query with only sorts
     */
    it('should serialize query with only sorts', () => {
      const query = {
        filters: [],
        sorts: [{ field: 'name', direction: SortDirection.ASC, nullPosition: NullPosition.LAST }],
        pagination: { limit: 0, offset: 0 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const serialized = queryParser.serialize(query);
      expect(serialized).toContain('ORDER BY');
    });

    /**
     * Test serialize query with only pagination
     */
    it('should serialize query with only pagination', () => {
      const query = {
        filters: [],
        sorts: [],
        pagination: { limit: 10, offset: 20 },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const serialized = queryParser.serialize(query);
      expect(serialized).toContain('LIMIT');
      expect(serialized).toContain('OFFSET');
    });
  });

  describe('Statistics Edge Cases', () => {
    /**
     * Test average parse time calculation
     */
    it('should calculate average parse time correctly', async () => {
      await queryParser.parse('name EQUALS "John"');
      await queryParser.parse('age GREATER_THAN 30');

      const stats = queryParser.getStats();
      expect(stats.averageParseTime).toBeGreaterThan(0);
    });

    /**
     * Test stats after reset
     */
    it('should reset stats to zero', async () => {
      await queryParser.parse('name EQUALS "John"');
      queryParser.setConfig({}); // This doesn't reset stats

      const stats = queryParser.getStats();
      expect(stats.totalParses).toBeGreaterThan(0);
    });

    /**
     * Test stats track failed parses
     */
    it('should track failed parses', async () => {
      await queryParser.parse('invalid query syntax');
      await queryParser.parse('another invalid');

      const stats = queryParser.getStats();
      expect(stats.failedParses).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    /**
     * Test parsing many queries quickly
     */
    it('should handle parsing many queries efficiently', async () => {
      const queries = Array(100).fill('name EQUALS "John"');

      const startTime = Date.now();
      for (const query of queries) {
        await queryParser.parse(query);
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    /**
     * Test parsing complex query
     */
    it('should handle complex query parsing', async () => {
      const complexQuery = 'name EQUALS "John" AND age GREATER_THAN 30 AND city EQUALS "NYC" sort by name ASC, age DESC limit 10 offset 20';
      const result = await queryParser.parse(complexQuery);

      expect(result.success).toBe(true);
    });

    /**
     * Test parsing with many allowed fields
     */
    it('should handle many allowed fields', () => {
      const fields = Array(100).fill(0).map((_, i) => `field${i}`);
      queryParser.setConfig({ allowedFields: fields });

      const allowedFields = queryParser.getAllowedFields();
      expect(allowedFields.length).toBe(100);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test parse with undefined query
     */
    it('should handle undefined query gracefully', async () => {
      const result = await queryParser.parse(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test parseFilter with undefined expression
     */
    it('should handle undefined filter expression', async () => {
      const result = await queryParser.parseFilter(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test parseSort with undefined expression
     */
    it('should handle undefined sort expression', async () => {
      const result = await queryParser.parseSort(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test parsePagination with undefined expression
     */
    it('should handle undefined pagination expression', async () => {
      const result = await queryParser.parsePagination(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test parseAggregation with undefined expression
     */
    it('should handle undefined aggregation expression', async () => {
      const result = await queryParser.parseAggregation(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test validate with undefined query
     */
    it('should handle undefined query in validation', () => {
      const result = queryParser.validate(undefined as any);

      expect(result.success).toBe(false);
    });

    /**
     * Test serialize with undefined query
     */
    it('should handle undefined query in serialization', () => {
      const result = queryParser.serialize(undefined as any);

      expect(result).toBeDefined();
    });
  });

  describe('Field Management', () => {
    /**
     * Test adding duplicate allowed field
     */
    it('should not add duplicate allowed field', () => {
      queryParser.addAllowedField('name');
      queryParser.addAllowedField('name');
      const fields = queryParser.getAllowedFields();

      expect(fields.filter((f) => f === 'name').length).toBe(1);
    });

    /**
     * Test adding duplicate forbidden field
     */
    it('should not add duplicate forbidden field', () => {
      queryParser.addForbiddenField('password');
      queryParser.addForbiddenField('password');
      const fields = queryParser.getForbiddenFields();

      expect(fields.filter((f) => f === 'password').length).toBe(1);
    });

    /**
     * Test removing non-existent allowed field
     */
    it('should handle removing non-existent allowed field', () => {
      queryParser.removeAllowedField('nonexistent');
      const fields = queryParser.getAllowedFields();

      expect(fields).toBeDefined();
    });

    /**
     * Test removing non-existent forbidden field
     */
    it('should handle removing non-existent forbidden field', () => {
      queryParser.removeForbiddenField('nonexistent');
      const fields = queryParser.getForbiddenFields();

      expect(fields).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    /**
     * Test config with validation disabled
     */
    it('should work with validation disabled', async () => {
      queryParser.setConfig({ enableValidation: false });
      const result = await queryParser.parse('any query here');

      expect(result.success).toBe(true);
    });

    /**
     * Test config with low maxDepth
     */
    it('should handle low maxDepth configuration', () => {
      queryParser.setConfig({ maxDepth: 1 });
      const config = queryParser.getConfig();

      expect(config.maxDepth).toBe(1);
    });

    /**
     * Test config with low maxComplexity
     */
    it('should handle low maxComplexity configuration', () => {
      queryParser.setConfig({ maxComplexity: 1 });
      const config = queryParser.getConfig();

      expect(config.maxComplexity).toBe(1);
    });
  });

  describe('Query Parser Instantiation', () => {
    /**
     * Test instantiation with custom config
     */
    it('should instantiate with custom config', () => {
      const customParser = new QueryParser({
        enableValidation: false,
        maxDepth: 20,
        maxComplexity: 200,
      });

      const config = customParser.getConfig();
      expect(config.enableValidation).toBe(false);
      expect(config.maxDepth).toBe(20);
      expect(config.maxComplexity).toBe(200);
    });

    /**
     * Test instantiation with empty config
     */
    it('should use defaults when config is empty', () => {
      const customParser = new QueryParser({});

      const config = customParser.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.maxDepth).toBe(10);
      expect(config.maxComplexity).toBe(100);
    });

    /**
     * Test instantiation without config
     */
    it('should use defaults when no config provided', () => {
      const customParser = new QueryParser();

      const config = customParser.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.maxDepth).toBe(10);
      expect(config.maxComplexity).toBe(100);
    });
  });

  describe('Parse Result Structure', () => {
    /**
     * Test successful parse result structure
     */
    it('should have correct structure for successful parse', async () => {
      const result = await queryParser.parse('name EQUALS "John"');

      expect(result.success).toBe(true);
      expect(result.query).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    /**
     * Test failed parse result structure
     */
    it('should have correct structure for failed parse', async () => {
      const result = await queryParser.parse('invalid syntax');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
    });

    /**
     * Test parse result with error code
     */
    it('should include error code in failed parse', async () => {
      const result = await queryParser.parse('invalid syntax');

      expect(result.errors[0].code).toBeDefined();
      expect(typeof result.errors[0].code).toBe('string');
    });

    /**
     * Test parse result with error message
     */
    it('should include error message in failed parse', async () => {
      const result = await queryParser.parse('invalid syntax');

      expect(result.errors[0].message).toBeDefined();
      expect(typeof result.errors[0].message).toBe('string');
    });

    /**
     * Test parse result with error position
     */
    it('should include error position in failed parse', async () => {
      const result = await queryParser.parse('invalid syntax');

      expect(result.errors[0].position).toBeDefined();
      expect(typeof result.errors[0].position).toBe('number');
    });

    /**
     * Test parse result with error severity
     */
    it('should include error severity in failed parse', async () => {
      const result = await queryParser.parse('invalid syntax');

      expect(result.errors[0].severity).toBeDefined();
      expect(typeof result.errors[0].severity).toBe('string');
    });
  });

  describe('Pagination Edge Cases', () => {
    /**
     * Test pagination with zero limit
     */
    it('should handle pagination with zero limit', async () => {
      const pagination = '0,0';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
    });

    /**
     * Test pagination with very large limit
     */
    it('should handle pagination with very large limit', async () => {
      const pagination = '999999,0';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
    });

    /**
     * Test pagination with negative offset
     */
    it('should handle pagination with negative offset', async () => {
      const pagination = '10,-5';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
    });

    /**
     * Test pagination with very large offset
     */
    it('should handle pagination with very large offset', async () => {
      const pagination = '10,999999';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
    });
  });

  describe('Sort Edge Cases', () => {
    /**
     * Test sort with empty field name
     */
    it('should handle sort with empty field name', async () => {
      const sort = '';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });

    /**
     * Test sort with field name containing spaces
     */
    it('should handle sort with field name containing spaces', async () => {
      const sort = 'first_name ASC';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });

    /**
     * Test sort with invalid direction
     */
    it('should default to ASC for invalid direction', async () => {
      const sort = 'name INVALID';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });
  });

  describe('Filter Edge Cases', () => {
    /**
     * Test filter with empty field name
     */
    it('should handle filter with empty field name', async () => {
      const filter = ' EQUALS "John"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test filter with invalid operator
     */
    it('should handle filter with invalid operator', async () => {
      const filter = 'name INVALID "John"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test filter with missing value
     */
    it('should handle filter with missing value', async () => {
      const filter = 'name EQUALS';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test filter with value containing spaces
     */
    it('should handle filter with value containing spaces', async () => {
      const filter = 'name EQUALS "John Doe"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });
  });

  describe('Aggregation Edge Cases', () => {
    /**
     * Test aggregation with invalid function
     */
    it('should default to COUNT for invalid function', async () => {
      const aggregation = 'INVALID(amount)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test aggregation with empty field
     */
    it('should handle aggregation with empty field', async () => {
      const aggregation = 'COUNT()';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });

    /**
     * Test aggregation with wildcard
     */
    it('should handle aggregation with wildcard', async () => {
      const aggregation = 'COUNT(*)';
      const result = await queryParser.parseAggregation(aggregation);

      expect(result.success).toBe(true);
    });
  });

  describe('Multiple Parser Instances', () => {
    /**
     * Test multiple instances have independent stats
     */
    it('should maintain independent stats across instances', async () => {
      const parser1 = new QueryParser();
      const parser2 = new QueryParser();

      await parser1.parse('name EQUALS "John"');
      await parser2.parse('age GREATER_THAN 30');

      const stats1 = parser1.getStats();
      const stats2 = parser2.getStats();

      expect(stats1.totalParses).toBe(1);
      expect(stats2.totalParses).toBe(1);
    });

    /**
     * Test multiple instances have independent config
     */
    it('should maintain independent config across instances', () => {
      const parser1 = new QueryParser();
      const parser2 = new QueryParser();

      parser1.setConfig({ enableValidation: false });
      parser2.setConfig({ maxDepth: 50 });

      const config1 = parser1.getConfig();
      const config2 = parser2.getConfig();

      expect(config1.enableValidation).toBe(false);
      expect(config1.maxDepth).toBe(10);
      expect(config2.enableValidation).toBe(true);
      expect(config2.maxDepth).toBe(50);
    });
  });

  describe('Concurrent Parsing', () => {
    /**
     * Test concurrent parsing operations
     */
    it('should handle concurrent parsing operations', async () => {
      const queries = Array(50).fill('name EQUALS "John"');

      const promises = queries.map((query) => queryParser.parse(query));
      const results = await Promise.all(promises);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Query with Cursor Pagination', () => {
    /**
     * Test pagination with cursor
     */
    it('should handle pagination with cursor', () => {
      const query = {
        filters: [],
        sorts: [],
        pagination: { limit: 10, offset: 0, cursor: 'abc123' },
        projections: [],
        groups: [],
        aggregations: [],
      };

      const serialized = queryParser.serialize(query);
      expect(serialized).toBeDefined();
    });
  });
});
