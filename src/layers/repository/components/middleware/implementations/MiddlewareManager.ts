/**
 * Middleware Manager Implementation
 * 
 * Concrete implementation of IMiddlewareManager.
 * Handles middleware chains and cross-cutting concerns.
 */

import { IMiddlewareManager } from '../interfaces/IMiddlewareManager';
import {
  MiddlewareFunction,
  MiddlewareContext,
  MiddlewareResult,
  MiddlewareChain,
  Middleware,
  MiddlewareConfig,
  MiddlewareStats,
  MiddlewarePipeline,
} from '../types/middleware-types';

export class MiddlewareManager<T = unknown> implements IMiddlewareManager<T> {
  private _middlewares: Map<string, Middleware<T>>;
  private _operationMiddlewares: Map<string, Middleware<T>[]>;
  private _config: MiddlewareConfig;
  private _stats: MiddlewareStats;

  constructor(config?: Partial<MiddlewareConfig>) {
    this._middlewares = new Map();
    this._operationMiddlewares = new Map();
    this._config = {
      enableGlobalMiddleware: true,
      enablePerOperationMiddleware: true,
      enableErrorHandling: true,
      enableLogging: false,
      ...config,
    };
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      middlewareExecutionCounts: new Map(),
    };
  }

  addMiddleware(middleware: Middleware<T>): void {
    this._middlewares.set(middleware.name, middleware);
  }

  removeMiddleware(name: string): void {
    this._middlewares.delete(name);
  }

  getMiddleware(name: string): Middleware<T> | undefined {
    return this._middlewares.get(name);
  }

  getMiddlewares(): Middleware<T>[] {
    return Array.from(this._middlewares.values());
  }

  enableMiddleware(name: string): void {
    const middleware = this._middlewares.get(name);
    if (middleware) {
      middleware.enabled = true;
    }
  }

  disableMiddleware(name: string): void {
    const middleware = this._middlewares.get(name);
    if (middleware) {
      middleware.enabled = false;
    }
  }

  createChain(middlewares: Middleware<T>[]): MiddlewareChain<T> {
    const enabledMiddlewares = middlewares.filter((m) => m.enabled);

    return {
      middlewares: enabledMiddlewares,
      execute: async (context: MiddlewareContext<T>): Promise<MiddlewareResult<T>> => {
        return this._executeChain(context, enabledMiddlewares);
      },
    };
  }

  async executeChain(context: MiddlewareContext<T>, chain: MiddlewareChain<T>): Promise<MiddlewareResult<T>> {
    const startTime = Date.now();
    this._stats.totalExecutions++;

    try {
      let index = 0;
      const next = async (): Promise<MiddlewareResult<T>> => {
        if (index >= chain.middlewares.length) {
          return {
            success: true,
            data: context.data,
            metadata: context.metadata,
          };
        }

        const middleware = chain.middlewares[index++];
        if (!middleware.enabled) {
          return next();
        }

        this._incrementMiddlewareExecutionCount(middleware.name);

        try {
          const result = await middleware.execute(context, next);

          if (result.success) {
            return result;
          } else {
            if (this._config.enableErrorHandling) {
              return result;
            }
            throw new Error(result.error?.message || 'Middleware error');
          }
        } catch (error) {
          this._stats.failedExecutions++;

          return {
            success: false,
            error: {
              code: 'MIDDLEWARE_ERROR',
              message: error instanceof Error ? error.message : 'Unknown middleware error',
              middleware: middleware.name,
            },
            metadata: context.metadata,
          };
        }
      };

      const result = await next();

      if (result.success) {
        this._stats.successfulExecutions++;
      }

      const executionTime = Date.now() - startTime;
      this._updateAverageExecutionTime(executionTime);

      return result;
    } catch (error) {
      this._stats.failedExecutions++;

      return {
        success: false,
        error: {
          code: 'CHAIN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown chain error',
          middleware: 'chain',
        },
        metadata: context.metadata,
      };
    }
  }

  async execute(context: MiddlewareContext<T>): Promise<MiddlewareResult<T>> {
    const middlewares = Array.from(this._middlewares.values())
      .filter((m) => m.enabled)
      .sort((a, b) => a.priority - b.priority);

    const chain = this.createChain(middlewares);
    return this.executeChain(context, chain);
  }

  createPipeline(name: string, middlewares: Middleware<T>[], parallel?: boolean): MiddlewarePipeline<T> {
    const enabledMiddlewares = middlewares.filter((m) => m.enabled);

    return {
      name,
      middlewares: enabledMiddlewares,
      parallel: parallel || false,
      execute: async (context: MiddlewareContext<T>): Promise<MiddlewareResult<T>> => {
        if (enabledMiddlewares.length === 0) {
          return {
            success: true,
            data: context.data,
            metadata: context.metadata,
          };
        }

        if (parallel) {
          return this._executeParallel(context, enabledMiddlewares);
        } else {
          return this._executeSequential(context, enabledMiddlewares);
        }
      },
    };
  }

  async executePipeline(pipeline: MiddlewarePipeline<T>, context: MiddlewareContext<T>): Promise<MiddlewareResult<T>> {
    return pipeline.execute(context);
  }

  setConfig(config: Partial<MiddlewareConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): MiddlewareConfig {
    return { ...this._config };
  }

  getStats(): MiddlewareStats {
    return {
      totalExecutions: this._stats.totalExecutions,
      successfulExecutions: this._stats.successfulExecutions,
      failedExecutions: this._stats.failedExecutions,
      averageExecutionTime: this._stats.averageExecutionTime,
      middlewareExecutionCounts: new Map(this._stats.middlewareExecutionCounts),
    };
  }

  resetStats(): void {
    this._stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      middlewareExecutionCounts: new Map(),
    };
  }

  clearMiddlewares(): void {
    this._middlewares.clear();
    this._operationMiddlewares.clear();
  }

  sortByPriority(): void {
    const sorted = Array.from(this._middlewares.values()).sort((a, b) => a.priority - b.priority);
    this._middlewares.clear();
    sorted.forEach((m) => this._middlewares.set(m.name, m));
  }

  getMiddlewaresForOperation(operation: string): Middleware<T>[] {
    return this._operationMiddlewares.get(operation) || [];
  }

  addMiddlewareForOperation(operation: string, middleware: Middleware<T>): void {
    const existing = this._operationMiddlewares.get(operation) || [];
    existing.push(middleware);
    this._operationMiddlewares.set(operation, existing);
  }

  removeMiddlewaresForOperation(operation: string): void {
    this._operationMiddlewares.delete(operation);
  }

  createContext(operation: string, data: T, metadata?: Record<string, unknown>): MiddlewareContext<T> {
    return {
      operation,
      timestamp: new Date(),
      data,
      metadata: metadata || {},
      state: new Map(),
    };
  }

  reset(): void {
    this.clearMiddlewares();
    this.resetStats();
    this._config = {
      enableGlobalMiddleware: true,
      enablePerOperationMiddleware: true,
      enableErrorHandling: true,
      enableLogging: false,
    };
  }

  private async _executeChain(context: MiddlewareContext<T>, middlewares: Middleware<T>[]): Promise<MiddlewareResult<T>> {
    const chain = this.createChain(middlewares);
    return this.executeChain(context, chain);
  }

  private async _executeSequential(context: MiddlewareContext<T>, middlewares: Middleware<T>[]): Promise<MiddlewareResult<T>> {
    let currentContext = { ...context };

    for (const middleware of middlewares) {
      const result = await this._executeSingle(currentContext, middleware);
      if (!result.success) {
        return result;
      }
      if (result.data !== undefined) {
        currentContext.data = result.data;
      }
    }

    return {
      success: true,
      data: currentContext.data,
      metadata: currentContext.metadata,
    };
  }

  private async _executeParallel(context: MiddlewareContext<T>, middlewares: Middleware<T>[]): Promise<MiddlewareResult<T>> {
    const promises = middlewares.map((m) => this._executeSingle(context, m));
    const results = await Promise.all(promises);

    for (const result of results) {
      if (!result.success) {
        return result;
      }
    }

    return {
      success: true,
      data: context.data,
      metadata: context.metadata,
    };
  }

  private async _executeSingle(context: MiddlewareContext<T>, middleware: Middleware<T>): Promise<MiddlewareResult<T>> {
    this._incrementMiddlewareExecutionCount(middleware.name);

    try {
      const next = async (): Promise<MiddlewareResult<T>> => {
        return {
          success: true,
          data: context.data,
          metadata: context.metadata,
        };
      };

      return await middleware.execute(context, next);
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MIDDLEWARE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown middleware error',
          middleware: middleware.name,
        },
        metadata: context.metadata,
      };
    }
  }

  private _incrementMiddlewareExecutionCount(name: string): void {
    const count = this._stats.middlewareExecutionCounts.get(name) || 0;
    this._stats.middlewareExecutionCounts.set(name, count + 1);
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalExecutions;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }
}
