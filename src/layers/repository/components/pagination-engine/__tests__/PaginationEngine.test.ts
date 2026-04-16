/**
 * Pagination Engine Layer Tests
 * 
 * Comprehensive test suite for PaginationEngine implementation.
 * Tests pagination application, cursor-based pagination, offset-based pagination, and statistics.
 */

import { PaginationEngine } from '../implementations/PaginationEngine';
import { IPaginationEngine } from '../interfaces/IPaginationEngine';
import {
  PaginationStrategy,
} from '../types/pagination-engine-types';

interface TestItem {
  id: string;
  name: string;
}

describe('PaginationEngine', () => {
  let paginationEngine: PaginationEngine<TestItem>;
  let testData: TestItem[];

  beforeEach(() => {
    // Initialize PaginationEngine before each test
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
      expect(config.defaultStrategy).toBe(PaginationStrategy.OFFSET);
      expect(config.defaultPageSize).toBe(20);
      expect(config.maxPageSize).toBe(100);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = paginationEngine.getStats();
      expect(stats.totalPaginations).toBe(0);
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
  });

  describe('Cursor-Based Pagination', () => {
    /**
     * Test applying cursor-based pagination
     */
    it('should apply cursor-based pagination successfully', () => {
      const result = paginationEngine.applyCursor(testData, 'item-5', 10, 'id');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
      expect(result.data?.[0].id).toBe('item-6');
    });

    /**
     * Test getting next cursor
     */
    it('should get next cursor', () => {
      const result = paginationEngine.applyOffset(testData, 0, 10);
      const cursor = paginationEngine.getCursor(result.data, 'id');

      expect(cursor).toBeDefined();
      expect(cursor).toBe('item-9');
    });

    /**
     * Test getting previous cursor
     */
    it('should get previous cursor', () => {
      const result = paginationEngine.applyOffset(testData, 10, 10);
      const cursor = paginationEngine.getPreviousCursor(result.data, 'id');

      expect(cursor).toBeDefined();
      expect(cursor).toBe('item-10');
    });
  });

  describe('Page Number Pagination', () => {
    /**
     * Test applying page number pagination
     */
    it('should apply page number pagination successfully', () => {
      const result = paginationEngine.applyPage(testData, 2, 10);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(10);
      expect(result.data?.[0].id).toBe('item-10');
    });

    /**
     * Test getting total pages
     */
    it('should calculate total pages correctly', () => {
      const totalPages = paginationEngine.getTotalPages(testData, 10);

      expect(totalPages).toBe(10);
    });

    /**
     * Test getting page count
     */
    it('should get page count', () => {
      const result = paginationEngine.applyPage(testData, 1, 10);
      const pageCount = paginationEngine.getPageCount(result.data, testData);

      expect(pageCount).toBe(10);
    });
  });

  describe('Pagination Info', () => {
    /**
     * Test getting pagination info
     */
    it('should return pagination info', () => {
      const result = paginationEngine.applyOffset(testData, 0, 10);
      const info = paginationEngine.getPaginationInfo(testData, 0, 10);

      expect(info).toBeDefined();
      expect(info.total).toBe(100);
      expect(info.limit).toBe(10);
      expect(info.offset).toBe(0);
    });

    /**
     * Test getting hasNextPage
     */
    it('should return true for hasNextPage', () => {
      const hasNext = paginationEngine.hasNextPage(testData, 0, 10);

      expect(hasNext).toBe(true);
    });

    /**
     * Test getting hasPreviousPage
     */
    it('should return false for hasPreviousPage on first page', () => {
      const hasPrevious = paginationEngine.hasPreviousPage(0);

      expect(hasPrevious).toBe(false);
    });

    /**
     * Test getting hasPreviousPage for later pages
     */
    it('should return true for hasPreviousPage on later pages', () => {
      const hasPrevious = paginationEngine.hasPreviousPage(10);

      expect(hasPrevious).toBe(true);
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
     * Test reset stats
     */
    it('should reset stats', () => {
      paginationEngine.applyOffset(testData, 0, 10);
      paginationEngine.resetStats();

      const stats = paginationEngine.getStats();
      expect(stats.totalPaginations).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        defaultStrategy: PaginationStrategy.CURSOR,
        defaultPageSize: 50,
        maxPageSize: 200,
      };

      paginationEngine.setConfig(newConfig);
      const config = paginationEngine.getConfig();

      expect(config.defaultStrategy).toBe(PaginationStrategy.CURSOR);
      expect(config.defaultPageSize).toBe(50);
      expect(config.maxPageSize).toBe(200);
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
  });
});
