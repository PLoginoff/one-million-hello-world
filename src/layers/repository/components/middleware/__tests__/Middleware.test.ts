/**
 * Middleware Layer Tests
 * 
 * Comprehensive test suite for Middleware implementation.
 * Tests middleware pipeline, execution order, error handling, and statistics.
 */

import { Middleware } from '../implementations/Middleware';
import { IMiddleware } from '../interfaces/IMiddleware';
import {
  MiddlewareFunction,
  MiddlewareContext,
} from '../types/middleware-types';

describe('Middleware', () => {
  let middleware: Middleware;

  beforeEach(() => {
    // Initialize Middleware before each test
    middleware = new Middleware();
  });

  describe('Initialization', () => {
    /**
     * Test that Middleware initializes with empty pipeline
     */
    it('should initialize with empty pipeline', () => {
      const pipeline = middleware.getPipeline();
      expect(pipeline.length).toBe(0);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = middleware.getStats();
      expect(stats.totalExecutions).toBe(0);
    });
  });

  describe('Middleware Registration', () => {
    /**
     * Test adding a middleware function
     */
    it('should add a middleware function successfully', () => {
      const fn: MiddlewareFunction = async (context, next) => {
        return next(context);
      };

      middleware.use(fn);
      const pipeline = middleware.getPipeline();

      expect(pipeline.length).toBe(1);
    });

    /**
     * Test adding multiple middleware functions
     */
    it('should add multiple middleware functions successfully', async () => {
      const fn1: MiddlewareFunction = async (context, next) => {
        context.metadata.order = 1;
        return next(context);
      };

      const fn2: MiddlewareFunction = async (context, next) => {
        context.metadata.order = 2;
        return next(context);
      };

      middleware.use(fn1);
      middleware.use(fn2);

      const pipeline = middleware.getPipeline();
      expect(pipeline.length).toBe(2);
    });
  });

  describe('Middleware Execution', () => {
    /**
     * Test executing middleware pipeline successfully
     */
    it('should execute middleware pipeline successfully', async () => {
      let executed = false;

      const fn: MiddlewareFunction = async (context, next) => {
        executed = true;
        return next(context);
      };

      middleware.use(fn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);

      expect(executed).toBe(true);
    });

    /**
     * Test middleware execution order
     */
    it('should execute middleware in correct order', async () => {
      const order: number[] = [];

      const fn1: MiddlewareFunction = async (context, next) => {
        order.push(1);
        return next(context);
      };

      const fn2: MiddlewareFunction = async (context, next) => {
        order.push(2);
        return next(context);
      };

      const fn3: MiddlewareFunction = async (context, next) => {
        order.push(3);
        return next(context);
      };

      middleware.use(fn1);
      middleware.use(fn2);
      middleware.use(fn3);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);

      expect(order).toEqual([1, 2, 3]);
    });

    /**
     * Test middleware can modify context
     */
    it('should allow middleware to modify context', async () => {
      const fn: MiddlewareFunction = async (context, next) => {
        context.metadata.modified = true;
        return next(context);
      };

      middleware.use(fn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);

      expect(context.metadata.modified).toBe(true);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test middleware error handling
     */
    it('should handle middleware errors', async () => {
      const errorFn: MiddlewareFunction = async () => {
        throw new Error('Middleware error');
      };

      middleware.use(errorFn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      const result = await middleware.execute(context);

      expect(result.success).toBe(false);
    });

    /**
     * Test error middleware catches errors
     */
    it('should allow error middleware to catch errors', async () => {
      const errorFn: MiddlewareFunction = async () => {
        throw new Error('Middleware error');
      };

      const errorHandler: MiddlewareFunction = async (context, next) => {
        try {
          return next(context);
        } catch (error) {
          context.metadata.error = 'caught';
          return { success: false, error };
        }
      };

      middleware.use(errorHandler);
      middleware.use(errorFn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);

      expect(context.metadata.error).toBe('caught');
    });
  });

  describe('Middleware Removal', () => {
    /**
     * Test removing a middleware function
     */
    it('should remove a middleware function successfully', () => {
      const fn: MiddlewareFunction = async (context, next) => {
        return next(context);
      };

      middleware.use(fn);
      middleware.remove(fn);

      const pipeline = middleware.getPipeline();
      expect(pipeline.length).toBe(0);
    });

    /**
     * Test clearing all middleware
     */
    it('should clear all middleware successfully', () => {
      const fn: MiddlewareFunction = async (context, next) => {
        return next(context);
      };

      middleware.use(fn);
      middleware.clear();

      const pipeline = middleware.getPipeline();
      expect(pipeline.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total executions
     */
    it('should track total executions', async () => {
      const fn: MiddlewareFunction = async (context, next) => {
        return next(context);
      };

      middleware.use(fn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);
      await middleware.execute(context);

      const stats = middleware.getStats();
      expect(stats.totalExecutions).toBe(2);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      const fn: MiddlewareFunction = async (context, next) => {
        return next(context);
      };

      middleware.use(fn);

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);
      middleware.resetStats();

      const stats = middleware.getStats();
      expect(stats.totalExecutions).toBe(0);
    });
  });

  describe('Conditional Execution', () => {
    /**
     * Test conditional middleware execution
     */
    it('should support conditional middleware execution', async () => {
      let executed = false;

      const fn: MiddlewareFunction = async (context, next) => {
        executed = true;
        return next(context);
      };

      middleware.use(fn, (context) => context.operation === 'test');

      const context: MiddlewareContext = {
        operation: 'test',
        metadata: {},
      };

      await middleware.execute(context);

      expect(executed).toBe(true);
    });
  });
});
