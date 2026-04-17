/**
 * Middleware Manager Layer Tests
 * 
 * Comprehensive test suite for MiddlewareManager implementation.
 * Tests middleware chains, pipelines, execution order, error handling, and statistics.
 */

import { MiddlewareManager } from '../implementations/MiddlewareManager';
import { IMiddlewareManager } from '../interfaces/IMiddlewareManager';
import {
  Middleware,
  MiddlewareContext,
  MiddlewareResult,
} from '../types/middleware-types';

interface TestData {
  value: string;
}

describe('MiddlewareManager', () => {
  let middlewareManager: MiddlewareManager<TestData>;

  beforeEach(() => {
    middlewareManager = new MiddlewareManager<TestData>();
  });

  describe('Initialization', () => {
    /**
     * Test that MiddlewareManager initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = middlewareManager.getConfig();
      expect(config.enableGlobalMiddleware).toBe(true);
      expect(config.enablePerOperationMiddleware).toBe(true);
      expect(config.enableErrorHandling).toBe(true);
      expect(config.enableLogging).toBe(false);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = middlewareManager.getStats();
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
    });
  });

  describe('Middleware Registration', () => {
    /**
     * Test adding a middleware
     */
    it('should add a middleware successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      const middlewares = middlewareManager.getMiddlewares();

      expect(middlewares.length).toBe(1);
    });

    /**
     * Test removing a middleware
     */
    it('should remove a middleware successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      middlewareManager.removeMiddleware('test');

      const middlewares = middlewareManager.getMiddlewares();
      expect(middlewares.length).toBe(0);
    });

    /**
     * Test getting a middleware by name
     */
    it('should return middleware by name', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      const retrieved = middlewareManager.getMiddleware('test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test');
    });

    /**
     * Test enabling a middleware
     */
    it('should enable a middleware successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: false,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      middlewareManager.enableMiddleware('test');

      const retrieved = middlewareManager.getMiddleware('test');
      expect(retrieved?.enabled).toBe(true);
    });

    /**
     * Test disabling a middleware
     */
    it('should disable a middleware successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      middlewareManager.disableMiddleware('test');

      const retrieved = middlewareManager.getMiddleware('test');
      expect(retrieved?.enabled).toBe(false);
    });
  });

  describe('Middleware Execution', () => {
    /**
     * Test executing middlewares successfully
     */
    it('should execute middlewares successfully', async () => {
      let executed = false;

      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          executed = true;
          return next();
        },
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);

      expect(executed).toBe(true);
    });

    /**
     * Test middleware execution order by priority
     */
    it('should execute middlewares in priority order', async () => {
      const order: number[] = [];

      const middleware1: Middleware<TestData> = {
        name: 'middleware1',
        priority: 2,
        enabled: true,
        execute: async (context, next) => {
          order.push(2);
          return next();
        },
      };

      const middleware2: Middleware<TestData> = {
        name: 'middleware2',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          order.push(1);
          return next();
        },
      };

      middlewareManager.addMiddleware(middleware1);
      middlewareManager.addMiddleware(middleware2);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);

      expect(order).toEqual([1, 2]);
    });

    /**
     * Test disabled middleware is not executed
     */
    it('should skip disabled middleware', async () => {
      let executed = false;

      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: false,
        execute: async (context, next) => {
          executed = true;
          return next();
        },
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);

      expect(executed).toBe(false);
    });
  });

  describe('Chain Execution', () => {
    /**
     * Test creating and executing a chain
     */
    it('should create and execute a chain successfully', async () => {
      let executed = false;

      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          executed = true;
          return next();
        },
      };

      const chain = middlewareManager.createChain([middleware]);
      const context = middlewareManager.createContext('test', { value: 'test' });

      const result = await middlewareManager.executeChain(context, chain);

      expect(executed).toBe(true);
      expect(result.success).toBe(true);
    });
  });

  describe('Pipeline Execution', () => {
    /**
     * Test creating and executing a pipeline
     */
    it('should create and execute a pipeline successfully', async () => {
      let executed = false;

      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          executed = true;
          return next();
        },
      };

      const pipeline = middlewareManager.createPipeline('testPipeline', [middleware]);
      const context = middlewareManager.createContext('test', { value: 'test' });

      const result = await middlewareManager.executePipeline(pipeline, context);

      expect(executed).toBe(true);
      expect(result.success).toBe(true);
    });

    /**
     * Test parallel pipeline execution
     */
    it('should execute pipeline in parallel when parallel is true', async () => {
      const order: string[] = [];

      const middleware1: Middleware<TestData> = {
        name: 'middleware1',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          order.push('m1');
          return next();
        },
      };

      const middleware2: Middleware<TestData> = {
        name: 'middleware2',
        priority: 1,
        enabled: true,
        execute: async (context, next) => {
          order.push('m2');
          return next();
        },
      };

      const pipeline = middlewareManager.createPipeline('testPipeline', [middleware1, middleware2], true);
      const context = middlewareManager.createContext('test', { value: 'test' });

      await middlewareManager.executePipeline(pipeline, context);

      expect(order.length).toBe(2);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableGlobalMiddleware: false,
        enablePerOperationMiddleware: false,
        enableErrorHandling: false,
        enableLogging: true,
      };

      middlewareManager.setConfig(newConfig);
      const config = middlewareManager.getConfig();

      expect(config.enableGlobalMiddleware).toBe(false);
      expect(config.enablePerOperationMiddleware).toBe(false);
      expect(config.enableErrorHandling).toBe(false);
      expect(config.enableLogging).toBe(true);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      middlewareManager.setConfig({ enableLogging: true });
      const config = middlewareManager.getConfig();

      expect(config.enableLogging).toBe(true);
      expect(config.enableGlobalMiddleware).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total executions
     */
    it('should track total executions', async () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);
      await middlewareManager.execute(context);

      const stats = middlewareManager.getStats();
      expect(stats.totalExecutions).toBe(2);
    });

    /**
     * Test stats track successful executions
     */
    it('should track successful executions', async () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);

      const stats = middlewareManager.getStats();
      expect(stats.successfulExecutions).toBe(1);
    });

    /**
     * Test stats track failed executions
     */
    it('should track failed executions', async () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async () => {
          throw new Error('Error');
        },
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);

      const stats = middlewareManager.getStats();
      expect(stats.failedExecutions).toBe(1);
    });

    /**
     * Test stats track middleware execution counts
     */
    it('should track middleware execution counts', async () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);
      await middlewareManager.execute(context);

      const stats = middlewareManager.getStats();
      expect(stats.middlewareExecutionCounts.get('test')).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);

      const context = middlewareManager.createContext('test', { value: 'test' });
      await middlewareManager.execute(context);
      middlewareManager.resetStats();

      const stats = middlewareManager.getStats();
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
    });
  });

  describe('Context Creation', () => {
    /**
     * Test creating middleware context
     */
    it('should create middleware context successfully', () => {
      const context = middlewareManager.createContext('test', { value: 'test' }, { meta: 'value' });

      expect(context.operation).toBe('test');
      expect(context.data).toEqual({ value: 'test' });
      expect(context.metadata.meta).toBe('value');
      expect(context.timestamp).toBeInstanceOf(Date);
      expect(context.state).toBeInstanceOf(Map);
    });
  });

  describe('Middleware Sorting', () => {
    /**
     * Test sorting by priority
     */
    it('should sort middlewares by priority', () => {
      const middleware1: Middleware<TestData> = {
        name: 'middleware1',
        priority: 3,
        enabled: true,
        execute: async (context, next) => next(),
      };

      const middleware2: Middleware<TestData> = {
        name: 'middleware2',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      const middleware3: Middleware<TestData> = {
        name: 'middleware3',
        priority: 2,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware1);
      middlewareManager.addMiddleware(middleware2);
      middlewareManager.addMiddleware(middleware3);

      middlewareManager.sortByPriority();

      const middlewares = middlewareManager.getMiddlewares();
      expect(middlewares[0].name).toBe('middleware2');
      expect(middlewares[1].name).toBe('middleware3');
      expect(middlewares[2].name).toBe('middleware1');
    });
  });

  describe('Operation Middlewares', () => {
    /**
     * Test adding middleware for operation
     */
    it('should add middleware for operation successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddlewareForOperation('read', middleware);

      const middlewares = middlewareManager.getMiddlewaresForOperation('read');
      expect(middlewares.length).toBe(1);
    });

    /**
     * Test getting middlewares for operation
     */
    it('should return empty array for operation with no middlewares', () => {
      const middlewares = middlewareManager.getMiddlewaresForOperation('read');
      expect(middlewares).toEqual([]);
    });

    /**
     * Test removing middlewares for operation
     */
    it('should remove middlewares for operation successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddlewareForOperation('read', middleware);
      middlewareManager.removeMiddlewaresForOperation('read');

      const middlewares = middlewareManager.getMiddlewaresForOperation('read');
      expect(middlewares).toEqual([]);
    });
  });

  describe('Clear Middlewares', () => {
    /**
     * Test clearing all middlewares
     */
    it('should clear all middlewares successfully', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      middlewareManager.clearMiddlewares();

      const middlewares = middlewareManager.getMiddlewares();
      expect(middlewares.length).toBe(0);
    });
  });

  describe('Reset', () => {
    /**
     * Test resetting middleware manager
     */
    it('should reset middleware manager to default state', () => {
      const middleware: Middleware<TestData> = {
        name: 'test',
        priority: 1,
        enabled: true,
        execute: async (context, next) => next(),
      };

      middlewareManager.addMiddleware(middleware);
      middlewareManager.addMiddlewareForOperation('read', middleware);
      middlewareManager.setConfig({ enableLogging: true });

      middlewareManager.reset();

      expect(middlewareManager.getMiddlewares().length).toBe(0);
      expect(middlewareManager.getMiddlewaresForOperation('read').length).toBe(0);
      expect(middlewareManager.getConfig().enableLogging).toBe(false);
      expect(middlewareManager.getStats().totalExecutions).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test executing with no middlewares
     */
    it('should return success when no middlewares', async () => {
      const context = middlewareManager.createContext('test', { value: 'test' });
      const result = await middlewareManager.execute(context);

      expect(result.success).toBe(true);
    });

    /**
     * Test pipeline with no middlewares
     */
    it('should return success when pipeline has no middlewares', async () => {
      const pipeline = middlewareManager.createPipeline('test', []);
      const context = middlewareManager.createContext('test', { value: 'test' });

      const result = await middlewareManager.executePipeline(pipeline, context);

      expect(result.success).toBe(true);
    });
  });
});
