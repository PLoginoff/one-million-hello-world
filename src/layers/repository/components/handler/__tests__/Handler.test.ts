/**
 * Handler Layer Tests
 * 
 * Comprehensive test suite for Handler implementation.
 * Tests handler operations, context management, middleware integration, and statistics.
 */

import { Handler } from '../implementations/Handler';
import { IHandler } from '../interfaces/IHandler';
import { HandlerContext, HandlerResult } from '../types/handler-types';

interface TestEntity {
  id: string;
  name: string;
}

describe('Handler', () => {
  let handler: Handler<TestEntity>;

  beforeEach(() => {
    // Initialize Handler before each test
    handler = new Handler<TestEntity>();
  });

  describe('Initialization', () => {
    /**
     * Test that Handler initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = handler.getConfig();
      expect(config.enableValidation).toBe(true);
      expect(config.enableMetrics).toBe(true);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = handler.getStats();
      expect(stats.totalOperations).toBe(0);
    });
  });

  describe('Context Creation', () => {
    /**
     * Test creating a handler context
     */
    it('should create a handler context successfully', () => {
      const context = handler.createContext('test-operation');

      expect(context).toBeDefined();
      expect(context.operation).toBe('test-operation');
    });

    /**
     * Test creating context with metadata
     */
    it('should create context with metadata successfully', () => {
      const context = handler.createContext('test-operation', { key: 'value' });

      expect(context).toBeDefined();
      expect(context.metadata).toBeDefined();
    });
  });

  describe('Handler Operations', () => {
    /**
     * Test handling a find operation
     */
    it('should handle a find operation successfully', async () => {
      const context = handler.createContext('find');
      const result = await handler.handleFind(context);

      expect(result).toBeDefined();
    });

    /**
     * Test handling a save operation
     */
    it('should handle a save operation successfully', async () => {
      const entity: TestEntity = {
        id: '1',
        name: 'Test',
      };

      const context = handler.createContext('save');
      const result = await handler.handleSave(entity, context);

      expect(result).toBeDefined();
    });

    /**
     * Test handling a delete operation
     */
    it('should handle a delete operation successfully', async () => {
      const context = handler.createContext('delete');
      const result = await handler.handleDelete('1', context);

      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    /**
     * Test handling errors in operations
     */
    it('should handle errors in operations gracefully', async () => {
      const context = handler.createContext('invalid-operation');
      const result = await handler.handle(context);

      expect(result).toBeDefined();
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total operations
     */
    it('should track total operations', async () => {
      const context = handler.createContext('find');
      await handler.handleFind(context);
      await handler.handleFind(context);

      const stats = handler.getStats();
      expect(stats.totalOperations).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      const context = handler.createContext('find');
      await handler.handleFind(context);
      handler.resetStats();

      const stats = handler.getStats();
      expect(stats.totalOperations).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableValidation: false,
        enableMetrics: false,
      };

      handler.setConfig(newConfig);
      const config = handler.getConfig();

      expect(config.enableValidation).toBe(false);
      expect(config.enableMetrics).toBe(false);
    });
  });

  describe('Middleware Integration', () => {
    /**
     * Test middleware integration
     */
    it('should integrate middleware successfully', async () => {
      let middlewareExecuted = false;

      const middlewareFn = async (context: HandlerContext, next: () => Promise<HandlerResult<TestEntity>>) => {
        middlewareExecuted = true;
        return next();
      };

      handler.use(middlewareFn);

      const context = handler.createContext('find');
      await handler.handleFind(context);

      expect(middlewareExecuted).toBe(true);
    });
  });
});
