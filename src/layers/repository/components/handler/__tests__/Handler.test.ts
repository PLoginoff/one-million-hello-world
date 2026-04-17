/**
 * Handler Manager Layer Tests
 * 
 * Comprehensive test suite for HandlerManager implementation.
 * Tests handler operations, context management, pipelines, and statistics.
 */

import { HandlerManager } from '../implementations/HandlerManager';
import { IHandlerManager } from '../interfaces/IHandlerManager';
import {
  HandlerOperation,
  HandlerContext,
  HandlerResult,
  OperationHandler,
  BulkOperationResult,
} from '../types/handler-types';

interface TestEntity {
  id: string;
  name: string;
}

describe('HandlerManager', () => {
  let handlerManager: HandlerManager<TestEntity>;

  beforeEach(() => {
    handlerManager = new HandlerManager<TestEntity>();
  });

  describe('Initialization', () => {
    /**
     * Test that HandlerManager initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = handlerManager.getConfig();
      expect(config.enableMetrics).toBe(true);
      expect(config.enableValidation).toBe(true);
      expect(config.enableCaching).toBe(false);
      expect(config.enableTransactions).toBe(false);
      expect(config.enableRetry).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelay).toBe(100);
      expect(config.timeout).toBe(30000);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = handlerManager.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
      expect(stats.retriedOperations).toBe(0);
    });
  });

  describe('Context Creation', () => {
    /**
     * Test creating a handler context
     */
    it('should create a handler context successfully', () => {
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');

      expect(context).toBeDefined();
      expect(context.operation).toBe(HandlerOperation.FIND);
      expect(context.requestId).toBe('req-1');
      expect(context.timestamp).toBeInstanceOf(Date);
      expect(context.state).toBeInstanceOf(Map);
    });

    /**
     * Test creating context with metadata
     */
    it('should create context with metadata successfully', () => {
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1', { key: 'value' });

      expect(context.metadata.key).toBe('value');
    });
  });

  describe('Handler Registration', () => {
    /**
     * Test registering a handler
     */
    it('should register a handler successfully', () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);

      const retrieved = handlerManager.getHandler(HandlerOperation.FIND);
      expect(retrieved).toBeDefined();
    });

    /**
     * Test unregistering a handler
     */
    it('should unregister a handler successfully', () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      handlerManager.unregisterHandler(HandlerOperation.FIND);

      const retrieved = handlerManager.getHandler(HandlerOperation.FIND);
      expect(retrieved).toBeUndefined();
    });

    /**
     * Test getting all handlers
     */
    it('should return all handlers successfully', () => {
      const handler1: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      const handler2: OperationHandler<TestEntity> = {
        operation: HandlerOperation.SAVE,
        canHandle: (op) => op === HandlerOperation.SAVE,
        handle: async (context, input) => {
          return {
            success: true,
            data: input as TestEntity,
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler1);
      handlerManager.registerHandler(handler2);

      const handlers = handlerManager.getHandlers();
      expect(handlers.length).toBe(2);
    });
  });

  describe('Handler Operations', () => {
    /**
     * Test handling find operation
     */
    it('should handle find operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [{ id: '1', name: 'Test' }],
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      const result = await handlerManager.handleFind(context, {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    /**
     * Test handling find by ID operation
     */
    it('should handle find by ID operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND_BY_ID,
        canHandle: (op) => op === HandlerOperation.FIND_BY_ID,
        handle: async (context, input) => {
          return {
            success: true,
            data: { id: '1', name: 'Test' },
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND_BY_ID, 'req-1');
      const result = await handlerManager.handleFindById(context, '1');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    /**
     * Test handling find one operation
     */
    it('should handle find one operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND_ONE,
        canHandle: (op) => op === HandlerOperation.FIND_ONE,
        handle: async (context, input) => {
          return {
            success: true,
            data: { id: '1', name: 'Test' },
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND_ONE, 'req-1');
      const result = await handlerManager.handleFindOne(context, {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    /**
     * Test handling save operation
     */
    it('should handle save operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.SAVE,
        canHandle: (op) => op === HandlerOperation.SAVE,
        handle: async (context, input) => {
          return {
            success: true,
            data: input as TestEntity,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.SAVE, 'req-1');
      const entity: TestEntity = { id: '1', name: 'Test' };
      const result = await handlerManager.handleSave(context, entity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entity);
    });

    /**
     * Test handling update operation
     */
    it('should handle update operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.UPDATE,
        canHandle: (op) => op === HandlerOperation.UPDATE,
        handle: async (context, input) => {
          return {
            success: true,
            data: input as TestEntity,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.UPDATE, 'req-1');
      const entity: TestEntity = { id: '1', name: 'Updated' };
      const result = await handlerManager.handleUpdate(context, entity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entity);
    });

    /**
     * Test handling delete operation
     */
    it('should handle delete operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.DELETE,
        canHandle: (op) => op === HandlerOperation.DELETE,
        handle: async (context, input) => {
          return {
            success: true,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.DELETE, 'req-1');
      const result = await handlerManager.handleDelete(context, '1');

      expect(result.success).toBe(true);
    });

    /**
     * Test handling delete many operation
     */
    it('should handle delete many operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.DELETE_MANY,
        canHandle: (op) => op === HandlerOperation.DELETE_MANY,
        handle: async (context, input) => {
          return {
            success: true,
            data: 5,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.DELETE_MANY, 'req-1');
      const result = await handlerManager.handleDeleteMany(context, ['1', '2', '3']);

      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });

    /**
     * Test handling count operation
     */
    it('should handle count operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.COUNT,
        canHandle: (op) => op === HandlerOperation.COUNT,
        handle: async (context, input) => {
          return {
            success: true,
            data: 10,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.COUNT, 'req-1');
      const result = await handlerManager.handleCount(context, {});

      expect(result.success).toBe(true);
      expect(result.data).toBe(10);
    });

    /**
     * Test handling exists operation
     */
    it('should handle exists operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.EXISTS,
        canHandle: (op) => op === HandlerOperation.EXISTS,
        handle: async (context, input) => {
          return {
            success: true,
            data: true,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.EXISTS, 'req-1');
      const result = await handlerManager.handleExists(context, '1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    /**
     * Test handling aggregate operation
     */
    it('should handle aggregate operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.AGGREGATE,
        canHandle: (op) => op === HandlerOperation.AGGREGATE,
        handle: async (context, input) => {
          return {
            success: true,
            data: { total: 100, average: 50 },
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.AGGREGATE, 'req-1');
      const result = await handlerManager.handleAggregate(context, {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ total: 100, average: 50 });
    });

    /**
     * Test handling bulk save operation
     */
    it('should handle bulk save operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.BULK_SAVE,
        canHandle: (op) => op === HandlerOperation.BULK_SAVE,
        handle: async (context, input) => {
          const entities = input as TestEntity[];
          const bulkResult: BulkOperationResult<TestEntity> = {
            successful: entities,
            failed: [],
            totalCount: entities.length,
            successCount: entities.length,
            failureCount: 0,
          };
          return {
            success: true,
            data: bulkResult,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.BULK_SAVE, 'req-1');
      const entities: TestEntity[] = [
        { id: '1', name: 'Test1' },
        { id: '2', name: 'Test2' },
      ];
      const result = await handlerManager.handleBulkSave(context, entities);

      expect(result.success).toBe(true);
      expect(result.data?.successCount).toBe(2);
    });

    /**
     * Test handling bulk delete operation
     */
    it('should handle bulk delete operation successfully', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.BULK_DELETE,
        canHandle: (op) => op === HandlerOperation.BULK_DELETE,
        handle: async (context, input) => {
          const ids = input as string[];
          const entities: TestEntity[] = ids.map(id => ({ id, name: `Deleted${id}` }));
          const bulkResult: BulkOperationResult<TestEntity> = {
            successful: entities,
            failed: [],
            totalCount: entities.length,
            successCount: entities.length,
            failureCount: 0,
          };
          return {
            success: true,
            data: bulkResult,
            metrics: {
              executionTime: 10,
              cacheHitRate: 0,
              databaseCalls: 1,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.BULK_DELETE, 'req-1');
      const result = await handlerManager.handleBulkDelete(context, ['1', '2']);

      expect(result.success).toBe(true);
      expect(result.data?.successCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test handling operation without registered handler
     */
    it('should return error when handler not registered', async () => {
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      const result = await handlerManager.handleFind(context, {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('HANDLER_NOT_FOUND');
    });
  });

  describe('Pipeline', () => {
    /**
     * Test creating a pipeline
     */
    it('should create a pipeline successfully', () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: input as TestEntity,
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      const pipeline = handlerManager.createPipeline([handler]);

      expect(pipeline).toBeDefined();
      expect(pipeline.handlers.length).toBe(1);
      expect(pipeline.execute).toBeDefined();
    });

    /**
     * Test executing a pipeline
     */
    it('should execute a pipeline successfully', async () => {
      let executed = false;

      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          executed = true;
          return {
            success: true,
            data: input as TestEntity,
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      const pipeline = handlerManager.createPipeline([handler]);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      const entity: TestEntity = { id: '1', name: 'Test' };
      const result = await handlerManager.executePipeline(pipeline, context, entity);

      expect(result.success).toBe(true);
      expect(executed).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total operations
     */
    it('should track total operations', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});
      await handlerManager.handleFind(context, {});

      const stats = handlerManager.getStats();
      expect(stats.totalOperations).toBe(2);
    });

    /**
     * Test stats track successful operations
     */
    it('should track successful operations', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});

      const stats = handlerManager.getStats();
      expect(stats.successfulOperations).toBe(1);
    });

    /**
     * Test stats track failed operations
     */
    it('should track failed operations', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: false,
            error: {
              code: 'ERROR',
              message: 'Test error',
              operation: HandlerOperation.FIND,
              retryable: false,
            },
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});

      const stats = handlerManager.getStats();
      expect(stats.failedOperations).toBe(1);
    });

    /**
     * Test stats track operation counts
     */
    it('should track operation counts', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});
      await handlerManager.handleFind(context, {});

      const stats = handlerManager.getStats();
      expect(stats.operationCounts.get(HandlerOperation.FIND)).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});
      handlerManager.resetStats();

      const stats = handlerManager.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableMetrics: false,
        enableValidation: false,
        enableRetry: false,
      };

      handlerManager.setConfig(newConfig);
      const config = handlerManager.getConfig();

      expect(config.enableMetrics).toBe(false);
      expect(config.enableValidation).toBe(false);
      expect(config.enableRetry).toBe(false);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      handlerManager.setConfig({ enableCaching: true });
      const config = handlerManager.getConfig();

      expect(config.enableCaching).toBe(true);
      expect(config.enableMetrics).toBe(true);
    });
  });

  describe('Clear Handlers', () => {
    /**
     * Test clearing all handlers
     */
    it('should clear all handlers successfully', () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      handlerManager.clearHandlers();

      const handlers = handlerManager.getHandlers();
      expect(handlers.length).toBe(0);
    });
  });

  describe('Reset', () => {
    /**
     * Test resetting handler manager
     */
    it('should reset handler manager to default state', () => {
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          return {
            success: true,
            data: [],
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      handlerManager.setConfig({ enableCaching: true });

      handlerManager.reset();

      expect(handlerManager.getHandlers().length).toBe(0);
      expect(handlerManager.getConfig().enableCaching).toBe(false);
      expect(handlerManager.getStats().totalOperations).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test executing operation with retry disabled
     */
    it('should not retry when retry disabled', async () => {
      handlerManager.setConfig({ enableRetry: false, maxRetries: 0 });

      let attempts = 0;
      const handler: OperationHandler<TestEntity> = {
        operation: HandlerOperation.FIND,
        canHandle: (op) => op === HandlerOperation.FIND,
        handle: async (context, input) => {
          attempts++;
          return {
            success: false,
            error: {
              code: 'ERROR',
              message: 'Test error',
              operation: HandlerOperation.FIND,
              retryable: true,
            },
            metrics: {
              executionTime: 0,
              cacheHitRate: 0,
              databaseCalls: 0,
              validationTime: 0,
              middlewareTime: 0,
              memoryUsage: 0,
            },
            metadata: {},
          };
        },
      };

      handlerManager.registerHandler(handler);
      const context = handlerManager.createContext(HandlerOperation.FIND, 'req-1');
      await handlerManager.handleFind(context, {});

      expect(attempts).toBe(1);
    });
  });
});
