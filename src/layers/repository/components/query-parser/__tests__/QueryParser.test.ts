/**
 * Query Parser Layer Tests
 * 
 * Comprehensive test suite for QueryParser implementation.
 * Tests query parsing, validation, serialization, and statistics.
 */

import { QueryParser } from '../implementations/QueryParser';
import { IQueryParser } from '../interfaces/IQueryParser';

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
      expect(config.enableStrictMode).toBe(false);
      expect(config.maxFilters).toBe(100);
      expect(config.maxSorts).toBe(50);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = queryParser.getStats();
      expect(stats.totalQueriesParsed).toBe(0);
      expect(stats.validQueries).toBe(0);
      expect(stats.invalidQueries).toBe(0);
    });
  });

  describe('Query Parsing', () => {
    /**
     * Test parsing a simple query string successfully
     */
    it('should parse a simple query string successfully', async () => {
      const query = 'name eq "John"';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.data?.filters.length).toBeGreaterThan(0);
    });

    /**
     * Test parsing empty query returns empty result
     */
    it('should return empty result for empty query', async () => {
      const result = await queryParser.parse('');

      expect(result.success).toBe(true);
      expect(result.data?.filters.length).toBe(0);
    });

    /**
     * Test parsing query with multiple filters
     */
    it('should parse query with multiple filters', async () => {
      const query = 'name eq "John" and age gt 30';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.data?.filters.length).toBe(2);
    });

    /**
     * Test parsing query with sort clause
     */
    it('should parse query with sort clause', async () => {
      const query = 'sort by name asc';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.data?.sorts.length).toBeGreaterThan(0);
    });

    /**
     * Test parsing query with pagination
     */
    it('should parse query with pagination', async () => {
      const query = 'limit 10 offset 20';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(true);
      expect(result.data?.pagination).toBeDefined();
    });

    /**
     * Test parsing invalid query returns error
     */
    it('should return error for invalid query syntax', async () => {
      const query = 'invalid syntax here';
      const result = await queryParser.parse(query);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Filter Parsing', () => {
    /**
     * Test parsing filter expression
     */
    it('should parse filter expression correctly', async () => {
      const filter = 'name eq "John"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
      expect(result.data?.field).toBe('name');
    });

    /**
     * Test parsing filter with AND operator
     */
    it('should parse filter with AND operator', async () => {
      const filter = 'name eq "John" and age gt 30';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test parsing filter with OR operator
     */
    it('should parse filter with OR operator', async () => {
      const filter = 'name eq "John" or name eq "Jane"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });

    /**
     * Test parsing filter with NOT operator
     */
    it('should parse filter with NOT operator', async () => {
      const filter = 'not name eq "John"';
      const result = await queryParser.parseFilter(filter);

      expect(result.success).toBe(true);
    });
  });

  describe('Sort Parsing', () => {
    /**
     * Test parsing sort expression
     */
    it('should parse sort expression correctly', async () => {
      const sort = 'sort by name asc';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
      expect(result.data?.field).toBe('name');
    });

    /**
     * Test parsing multiple sorts
     */
    it('should parse multiple sorts', async () => {
      const sort = 'sort by name asc, age desc';
      const result = await queryParser.parseSort(sort);

      expect(result.success).toBe(true);
    });
  });

  describe('Pagination Parsing', () => {
    /**
     * Test parsing pagination with limit and offset
     */
    it('should parse pagination with limit and offset', async () => {
      const pagination = 'limit 10 offset 20';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
      expect(result.data?.offset).toBe(20);
    });

    /**
     * Test parsing pagination with limit only
     */
    it('should parse pagination with limit only', async () => {
      const pagination = 'limit 10';
      const result = await queryParser.parsePagination(pagination);

      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(10);
    });
  });

  describe('Query Validation', () => {
    /**
     * Test valid query passes validation
     */
    it('should validate a valid query successfully', async () => {
      const query = 'name eq "John"';
      const result = await queryParser.validate(query);

      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
    });

    /**
     * Test invalid query fails validation
     */
    it('should fail validation for invalid query', async () => {
      const query = 'invalid';
      const result = await queryParser.validate(query);

      expect(result.success).toBe(true);
      expect(result.valid).toBe(false);
    });

    /**
     * Test query with forbidden field fails validation
     */
    it('should fail validation for forbidden fields', async () => {
      queryParser.setForbiddenFields(['password']);
      const query = 'password eq "secret"';
      const result = await queryParser.validate(query);

      expect(result.success).toBe(true);
      expect(result.valid).toBe(false);
    });

    /**
     * Test query with allowed fields passes validation
     */
    it('should pass validation for allowed fields', async () => {
      queryParser.setAllowedFields(['name', 'age']);
      const query = 'name eq "John"';
      const result = await queryParser.validate(query);

      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
    });
  });

  describe('Query Serialization', () => {
    /**
     * Test serialize parsed query to string
     */
    it('should serialize parsed query to string', async () => {
      const parsed = await queryParser.parse('name eq "John"');
      const serialized = queryParser.serialize(parsed.data);

      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
    });

    /**
     * Test deserialize string to parsed query
     */
    it('should deserialize string to parsed query', async () => {
      const parsed = await queryParser.parse('name eq "John"');
      const serialized = queryParser.serialize(parsed.data);
      const deserialized = queryParser.deserialize(serialized);

      expect(deserialized).toBeDefined();
      expect(deserialized.filters.length).toBe(parsed.data?.filters.length);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total queries parsed
     */
    it('should track total queries parsed', async () => {
      await queryParser.parse('name eq "John"');
      await queryParser.parse('age gt 30');

      const stats = queryParser.getStats();
      expect(stats.totalQueriesParsed).toBe(2);
    });

    /**
     * Test stats track valid queries
     */
    it('should track valid queries', async () => {
      await queryParser.parse('name eq "John"');
      await queryParser.parse('age gt 30');

      const stats = queryParser.getStats();
      expect(stats.validQueries).toBe(2);
    });

    /**
     * Test stats track invalid queries
     */
    it('should track invalid queries', async () => {
      await queryParser.parse('invalid syntax');
      await queryParser.parse('another invalid');

      const stats = queryParser.getStats();
      expect(stats.invalidQueries).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      await queryParser.parse('name eq "John"');
      queryParser.resetStats();

      const stats = queryParser.getStats();
      expect(stats.totalQueriesParsed).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableValidation: false,
        enableStrictMode: true,
        maxFilters: 50,
      };

      queryParser.setConfig(newConfig);
      const config = queryParser.getConfig();

      expect(config.enableValidation).toBe(false);
      expect(config.enableStrictMode).toBe(true);
      expect(config.maxFilters).toBe(50);
    });

    /**
     * Test setting allowed fields
     */
    it('should set allowed fields', () => {
      queryParser.setAllowedFields(['name', 'age', 'email']);
      const fields = queryParser.getAllowedFields();

      expect(fields).toContain('name');
      expect(fields).toContain('age');
    });

    /**
     * Test setting forbidden fields
     */
    it('should set forbidden fields', () => {
      queryParser.setForbiddenFields(['password', 'token']);
      const fields = queryParser.getForbiddenFields();

      expect(fields).toContain('password');
      expect(fields).toContain('token');
    });
  });
});
