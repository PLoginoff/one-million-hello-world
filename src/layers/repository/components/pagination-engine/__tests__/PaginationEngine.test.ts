/**
 * Pagination Engine Layer Tests
 * 
 * Comprehensive test suite for PaginationEngine implementation.
 * Tests pagination application, cursor-based pagination, offset-based pagination, and statistics.
 */

import { PaginationEngine } from '../implementations/PaginationEngine';
import { IPaginationEngine } from '../interfaces/IPaginationEngine';
import { ParsedPagination } from '../../query-parser/types/query-parser-types';

interface TestItem {
  id: string;
  name: string;
}

describe('PaginationEngine', () => {
  let paginationEngine: PaginationEngine<TestItem>;
  let testData: TestItem[];

  beforeEach(() => {
    paginationEngine = new PaginationEngine<TestItem>();
    testData = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
    }));
  });

  describe('Initialization', () => {
    /**
     * Test that PaginationEngine initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = paginationEngine.getConfig();
      expect(config.defaultLimit).toBe(10);
      expect(config.maxLimit).toBe(100);
      expect(config.enableCursorPagination).toBe(true);
      expect(config.enableOffsetPagination).toBe(true);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = paginationEngine.getStats();
      expect(stats.totalPaginations).toBe(0);
      expect(stats.averagePageSize).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });

  describe('Apply Parsed Pagination', () => {
    /**
     * Test applying parsed pagination
     */
    it('should apply parsed pagination successfully', () => {
      const pagination: ParsedPagination = {
        limit: 10,
        offset: 0,
      };

      const result = paginationEngine.apply(testData, pagination);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
      expect(result.data?.[0].id).toBe('item-0');
    });

    /**
     * Test applying pagination with total parameter
     */
    it('should apply pagination with total parameter', () => {
      const pagination: ParsedPagination = {
        limit: 10,
        offset: 0,
      };

      const result = paginationEngine.apply(testData, pagination, 100);

      expect(result.success).toBe(true);
      expect(result.pagination.total).toBe(100);
    });
  });

  describe('Offset-Based Pagination', () => {
    /**
     * Test applying offset-based pagination
     */
    it('should apply offset-based pagination successfully', () => {
      const result = paginationEngine.applyOffset(testData, 0, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
      expect(result.data?.[0].id).toBe('item-0');
    });

    /**
     * Test applying pagination with offset
     */
    it('should apply pagination with offset', () => {
      const result = paginationEngine.applyOffset(testData, 10, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
      expect(result.data?.[0].id).toBe('item-10');
    });

    /**
     * Test pagination returns empty array when offset exceeds data
     */
    it('should return empty array when offset exceeds data', () => {
      const result = paginationEngine.applyOffset(testData, 100, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test pagination handles limit larger than remaining data
     */
    it('should handle limit larger than remaining data', () => {
      const result = paginationEngine.applyOffset(testData, 95, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(5);
    });

    /**
     * Test pagination with total parameter
     */
    it('should handle total parameter in offset pagination', () => {
      const result = paginationEngine.applyOffset(testData, 0, 10, 100);

      expect(result.success).toBe(true);
      expect(result.pagination.total).toBe(100);
    });
  });

  describe('Cursor-Based Pagination', () => {
    /**
     * Test applying cursor-based pagination forward
     */
    it('should apply cursor-based pagination forward successfully', () => {
      const cursor = paginationEngine.generateCursor(testData[5], 'id');
      const result = paginationEngine.applyCursor(testData, cursor, 10, 'FORWARD');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBeGreaterThan(0);
    });

    /**
     * Test applying cursor-based pagination backward
     */
    it('should apply cursor-based pagination backward successfully', () => {
      const cursor = paginationEngine.generateCursor(testData[50], 'id');
      const result = paginationEngine.applyCursor(testData, cursor, 10, 'BACKWARD');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBeGreaterThan(0);
    });

    /**
     * Test applying cursor pagination without cursor
     */
    it('should apply cursor pagination without cursor', () => {
      const result = paginationEngine.applyCursor(testData, undefined, 10, 'FORWARD');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
    });

    /**
     * Test generating cursor
     */
    it('should generate cursor for item', () => {
      const cursor = paginationEngine.generateCursor(testData[0], 'id');

      expect(cursor).toBeDefined();
      expect(typeof cursor).toBe('string');
    });

    /**
     * Test parsing cursor
     */
    it('should parse cursor correctly', () => {
      const cursor = paginationEngine.generateCursor(testData[0], 'id');
      const cursorInfo = paginationEngine.parseCursor(cursor);

      expect(cursorInfo).toBeDefined();
      expect(cursorInfo.field).toBe('id');
    });

    /**
     * Test parsing invalid cursor throws error
     */
    it('should throw error when parsing invalid cursor', () => {
      expect(() => {
        paginationEngine.parseCursor('invalid-cursor');
      }).toThrow();
    });

    /**
     * Test cursor pagination disabled
     */
    it('should return error when cursor pagination is disabled', () => {
      paginationEngine.setConfig({ enableCursorPagination: false });
      const cursor = paginationEngine.generateCursor(testData[0], 'id');
      const result = paginationEngine.applyCursor(testData, cursor, 10, 'FORWARD');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Page Number Calculations', () => {
    /**
     * Test calculating total pages
     */
    it('should calculate total pages correctly', () => {
      const totalPages = paginationEngine.calculateTotalPages(100, 10);

      expect(totalPages).toBe(10);
    });

    /**
     * Test calculating total pages with remainder
     */
    it('should calculate total pages with remainder', () => {
      const totalPages = paginationEngine.calculateTotalPages(105, 10);

      expect(totalPages).toBe(11);
    });

    /**
     * Test calculating total pages with zero limit
     */
    it('should return 0 for total pages with zero limit', () => {
      const totalPages = paginationEngine.calculateTotalPages(100, 0);

      expect(totalPages).toBe(0);
    });

    /**
     * Test calculating offset from page number
     */
    it('should calculate offset from page number', () => {
      const offset = paginationEngine.calculateOffset(2, 10);

      expect(offset).toBe(10);
    });

    /**
     * Test calculating offset from first page
     */
    it('should return 0 for first page offset', () => {
      const offset = paginationEngine.calculateOffset(1, 10);

      expect(offset).toBe(0);
    });

    /**
     * Test calculating offset with negative page number
     */
    it('should return 0 for negative page number', () => {
      const offset = paginationEngine.calculateOffset(-1, 10);

      expect(offset).toBe(0);
    });

    /**
     * Test calculating page number from offset
     */
    it('should calculate page number from offset', () => {
      const pageNumber = paginationEngine.calculatePageNumber(10, 10);

      expect(pageNumber).toBe(2);
    });

    /**
     * Test calculating page number from zero offset
     */
    it('should return 1 for zero offset', () => {
      const pageNumber = paginationEngine.calculatePageNumber(0, 10);

      expect(pageNumber).toBe(1);
    });
  });

  describe('Pagination Metadata', () => {
    /**
     * Test getting pagination metadata
     */
    it('should return pagination metadata', () => {
      const metadata = paginationEngine.getMetadata(100, 10, 0);

      expect(metadata.total).toBe(100);
      expect(metadata.limit).toBe(10);
      expect(metadata.offset).toBe(0);
      expect(metadata.currentPage).toBe(1);
      expect(metadata.totalPages).toBe(10);
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrevious).toBe(false);
    });

    /**
     * Test getting pagination metadata for middle page
     */
    it('should return correct metadata for middle page', () => {
      const metadata = paginationEngine.getMetadata(100, 10, 50);

      expect(metadata.total).toBe(100);
      expect(metadata.limit).toBe(10);
      expect(metadata.offset).toBe(50);
      expect(metadata.currentPage).toBe(6);
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrevious).toBe(true);
    });

    /**
     * Test getting pagination metadata for last page
     */
    it('should return correct metadata for last page', () => {
      const metadata = paginationEngine.getMetadata(100, 10, 90);

      expect(metadata.total).toBe(100);
      expect(metadata.limit).toBe(10);
      expect(metadata.offset).toBe(90);
      expect(metadata.currentPage).toBe(10);
      expect(metadata.hasNext).toBe(false);
      expect(metadata.hasPrevious).toBe(true);
    });
  });

  describe('Page Info', () => {
    /**
     * Test getting page info
     */
    it('should return page info', () => {
      const pageInfo = paginationEngine.getPageInfo(100, 10, 2);

      expect(pageInfo.number).toBe(2);
      expect(pageInfo.size).toBe(10);
      expect(pageInfo.totalElements).toBe(100);
      expect(pageInfo.totalPages).toBe(10);
      expect(pageInfo.hasNext).toBe(true);
      expect(pageInfo.hasPrevious).toBe(true);
    });

    /**
     * Test getting page info for first page
     */
    it('should return correct page info for first page', () => {
      const pageInfo = paginationEngine.getPageInfo(100, 10, 1);

      expect(pageInfo.number).toBe(1);
      expect(pageInfo.hasPrevious).toBe(false);
      expect(pageInfo.hasNext).toBe(true);
    });

    /**
     * Test getting page info for last page
     */
    it('should return correct page info for last page', () => {
      const pageInfo = paginationEngine.getPageInfo(100, 10, 10);

      expect(pageInfo.number).toBe(10);
      expect(pageInfo.hasPrevious).toBe(true);
      expect(pageInfo.hasNext).toBe(false);
    });
  });

  describe('Pagination Validation', () => {
    /**
     * Test validating valid pagination
     */
    it('should validate valid pagination', () => {
      const pagination: ParsedPagination = {
        limit: 10,
        offset: 0,
      };

      const isValid = paginationEngine.validate(pagination);

      expect(isValid).toBe(true);
    });

    /**
     * Test invalid pagination with negative limit
     */
    it('should fail validation for negative limit', () => {
      const pagination: ParsedPagination = {
        limit: -10,
        offset: 0,
      };

      const isValid = paginationEngine.validate(pagination);

      expect(isValid).toBe(false);
    });

    /**
     * Test invalid pagination with negative offset
     */
    it('should fail validation for negative offset', () => {
      const pagination: ParsedPagination = {
        limit: 10,
        offset: -5,
      };

      const isValid = paginationEngine.validate(pagination);

      expect(isValid).toBe(false);
    });

    /**
     * Test invalid pagination with limit exceeding max
     */
    it('should fail validation for limit exceeding max', () => {
      paginationEngine.setConfig({ maxLimit: 50 });
      const pagination: ParsedPagination = {
        limit: 100,
        offset: 0,
      };

      const isValid = paginationEngine.validate(pagination);

      expect(isValid).toBe(false);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total paginations
     */
    it('should track total paginations', () => {
      paginationEngine.applyOffset(testData, 0, 10);
      paginationEngine.applyOffset(testData, 10, 10);

      const stats = paginationEngine.getStats();
      expect(stats.totalPaginations).toBe(2);
    });

    /**
     * Test stats track average page size
     */
    it('should track average page size', () => {
      paginationEngine.applyOffset(testData, 0, 10);
      paginationEngine.applyOffset(testData, 10, 20);

      const stats = paginationEngine.getStats();
      expect(stats.averagePageSize).toBe(15);
    });

    /**
     * Test stats track average execution time
     */
    it('should track average execution time', () => {
      paginationEngine.applyOffset(testData, 0, 10);

      const stats = paginationEngine.getStats();
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', () => {
      paginationEngine.applyOffset(testData, 0, 10);
      paginationEngine.resetStats();

      const stats = paginationEngine.getStats();
      expect(stats.totalPaginations).toBe(0);
      expect(stats.averagePageSize).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        defaultLimit: 50,
        maxLimit: 200,
        enableCursorPagination: false,
        enableOffsetPagination: true,
      };

      paginationEngine.setConfig(newConfig);
      const config = paginationEngine.getConfig();

      expect(config.defaultLimit).toBe(50);
      expect(config.maxLimit).toBe(200);
      expect(config.enableCursorPagination).toBe(false);
      expect(config.enableOffsetPagination).toBe(true);
    });

    /**
     * Test configuration limits are enforced
     */
    it('should enforce max limit in applyOffset', () => {
      paginationEngine.setConfig({ maxLimit: 50 });
      const result = paginationEngine.applyOffset(testData, 0, 100);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(50);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test pagination with empty data
     */
    it('should handle empty data', () => {
      const result = paginationEngine.applyOffset([], 0, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test pagination with limit of zero
     */
    it('should handle limit of zero', () => {
      const result = paginationEngine.applyOffset(testData, 0, 0);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
    });

    /**
     * Test pagination with single element
     */
    it('should handle single element array', () => {
      const singleElement = [{ id: 'item-0', name: 'Item 0' }];
      const result = paginationEngine.applyOffset(singleElement, 0, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
    });

    /**
     * Test pagination with negative offset
     */
    it('should handle negative offset', () => {
      const result = paginationEngine.applyOffset(testData, -10, 10);

      expect(result.success).toBe(true);
      expect(result.data?.[0].id).toBe('item-0');
    });
  });
});
