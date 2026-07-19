/**
 * Handler Manager Implementation
 *
 * Concrete implementation of IHandlerManager.
 * Handles business logic handlers and operation orchestration.
 */

import { DomainEntity } from '../../../../domain/types/domain-types';
import { IHandlerManager } from '../interfaces/IHandlerManager';
import {
  HandlerOperation,
  HandlerContext,
  HandlerResult,
  HandlerConfig,
  HandlerStats,
  OperationHandler,
  HandlerPipeline,
  BulkOperationResult,
  HandlerError,
  HandlerMetrics,
} from '../types/handler-types';

export class HandlerManager<T extends DomainEntity> implements IHandlerManager<T> {
  private _handlers: Map<HandlerOperation, OperationHandler<T>>;
  private _config: HandlerConfig;
  private _stats: HandlerStats;

  constructor(config?: Partial<HandlerConfig>) {
    this._handlers = new Map();
    this._config = {
      enableMetrics: true,
      enableValidation: true,
      enableCaching: false,
      enableTransactions: false,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 100,
      timeout: 30000,
      ...config,
    };
    this._stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      retriedOperations: 0,
      averageExecutionTime: 0,
      operationCounts: new Map(),
    };
  }

  handleFind(context: HandlerContext, input: unknown): Promise<HandlerResult<T[]>> {
    return this._executeWithRetry<T[]>(HandlerOperation.FIND, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND);
      if (!handler) {
        return this._createErrorResult<T[]>(
          HandlerOperation.FIND,
          'HANDLER_NOT_FOUND',
          'No handler registered for FIND operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<T[]>>;
    });
  }

  handleFindById(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry<T>(HandlerOperation.FIND_BY_ID, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND_BY_ID);
      if (!handler) {
        return this._createErrorResult<T>(
          HandlerOperation.FIND_BY_ID,
          'HANDLER_NOT_FOUND',
          'No handler registered for FIND_BY_ID operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<T>>;
    });
  }

  handleFindOne(context: HandlerContext, input: unknown): Promise<HandlerResult<T | null>> {
    return this._executeWithRetry<T | null>(HandlerOperation.FIND_ONE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND_ONE);
      if (!handler) {
        return this._createErrorResult<T | null>(
          HandlerOperation.FIND_ONE,
          'HANDLER_NOT_FOUND',
          'No handler registered for FIND_ONE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<T | null>>;
    });
  }

  handleSave(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry<T>(HandlerOperation.SAVE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.SAVE);
      if (!handler) {
        return this._createErrorResult<T>(
          HandlerOperation.SAVE,
          'HANDLER_NOT_FOUND',
          'No handler registered for SAVE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<T>>;
    });
  }

  handleUpdate(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry<T>(HandlerOperation.UPDATE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.UPDATE);
      if (!handler) {
        return this._createErrorResult<T>(
          HandlerOperation.UPDATE,
          'HANDLER_NOT_FOUND',
          'No handler registered for UPDATE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<T>>;
    });
  }

  handleDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<void>> {
    return this._executeWithRetry<void>(HandlerOperation.DELETE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.DELETE);
      if (!handler) {
        return this._createErrorResult<void>(
          HandlerOperation.DELETE,
          'HANDLER_NOT_FOUND',
          'No handler registered for DELETE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<void>>;
    });
  }

  handleDeleteMany(context: HandlerContext, input: unknown): Promise<HandlerResult<number>> {
    return this._executeWithRetry<number>(HandlerOperation.DELETE_MANY, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.DELETE_MANY);
      if (!handler) {
        return this._createErrorResult<number>(
          HandlerOperation.DELETE_MANY,
          'HANDLER_NOT_FOUND',
          'No handler registered for DELETE_MANY operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<number>>;
    });
  }

  handleCount(context: HandlerContext, input: unknown): Promise<HandlerResult<number>> {
    return this._executeWithRetry<number>(HandlerOperation.COUNT, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.COUNT);
      if (!handler) {
        return this._createErrorResult<number>(
          HandlerOperation.COUNT,
          'HANDLER_NOT_FOUND',
          'No handler registered for COUNT operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<number>>;
    });
  }

  handleExists(context: HandlerContext, input: unknown): Promise<HandlerResult<boolean>> {
    return this._executeWithRetry<boolean>(HandlerOperation.EXISTS, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.EXISTS);
      if (!handler) {
        return this._createErrorResult<boolean>(
          HandlerOperation.EXISTS,
          'HANDLER_NOT_FOUND',
          'No handler registered for EXISTS operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<boolean>>;
    });
  }

  handleAggregate(context: HandlerContext, input: unknown): Promise<HandlerResult<Record<string, unknown>>> {
    return this._executeWithRetry<Record<string, unknown>>(HandlerOperation.AGGREGATE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.AGGREGATE);
      if (!handler) {
        return this._createErrorResult<Record<string, unknown>>(
          HandlerOperation.AGGREGATE,
          'HANDLER_NOT_FOUND',
          'No handler registered for AGGREGATE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<Record<string, unknown>>>;
    });
  }

  handleBulkSave(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>> {
    return this._executeWithRetry<BulkOperationResult<T>>(HandlerOperation.BULK_SAVE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.BULK_SAVE);
      if (!handler) {
        return this._createErrorResult<BulkOperationResult<T>>(
          HandlerOperation.BULK_SAVE,
          'HANDLER_NOT_FOUND',
          'No handler registered for BULK_SAVE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<BulkOperationResult<T>>>;
    });
  }

  handleBulkDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>> {
    return this._executeWithRetry<BulkOperationResult<T>>(HandlerOperation.BULK_DELETE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.BULK_DELETE);
      if (!handler) {
        return this._createErrorResult<BulkOperationResult<T>>(
          HandlerOperation.BULK_DELETE,
          'HANDLER_NOT_FOUND',
          'No handler registered for BULK_DELETE operation'
        );
      }
      return handler.handle(context, input) as unknown as Promise<HandlerResult<BulkOperationResult<T>>>;
    });
  }

  registerHandler(handler: OperationHandler<T>): void {
    this._handlers.set(handler.operation, handler);
  }

  unregisterHandler(operation: HandlerOperation): void {
    this._handlers.delete(operation);
  }

  getHandler(operation: HandlerOperation): OperationHandler<T> | undefined {
    return this._handlers.get(operation);
  }

  getHandlers(): OperationHandler<T>[] {
    return Array.from(this._handlers.values());
  }

  createPipeline(
    handlers: OperationHandler<T>[],
    preHandlers?: OperationHandler<T>[],
    postHandlers?: OperationHandler<T>[]
  ): HandlerPipeline<T> {
    return {
      handlers,
      preHandlers: preHandlers ?? [],
      postHandlers: postHandlers ?? [],
      execute: (context: HandlerContext, input: unknown): Promise<HandlerResult<T>> => {
        return Promise.resolve(this._executePipeline(context, input, handlers, preHandlers, postHandlers));
      },
    };
  }

  executePipeline(pipeline: HandlerPipeline<T>, context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return Promise.resolve(
      this._executePipeline(context, input, pipeline.handlers, pipeline.preHandlers, pipeline.postHandlers)
    );
  }

  setConfig(config: Partial<HandlerConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): HandlerConfig {
    return { ...this._config };
  }

  getStats(): HandlerStats {
    return {
      totalOperations: this._stats.totalOperations,
      successfulOperations: this._stats.successfulOperations,
      failedOperations: this._stats.failedOperations,
      retriedOperations: this._stats.retriedOperations,
      averageExecutionTime: this._stats.averageExecutionTime,
      operationCounts: new Map(this._stats.operationCounts),
    };
  }

  resetStats(): void {
    this._stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      retriedOperations: 0,
      averageExecutionTime: 0,
      operationCounts: new Map(),
    };
  }

  createContext(operation: HandlerOperation, requestId: string, metadata?: Record<string, unknown>): HandlerContext {
    return {
      operation,
      timestamp: new Date(),
      requestId,
      metadata: metadata ?? {},
      state: new Map(),
    };
  }

  clearHandlers(): void {
    this._handlers.clear();
  }

  reset(): void {
    this.clearHandlers();
    this.resetStats();
    this._config = {
      enableMetrics: true,
      enableValidation: true,
      enableCaching: false,
      enableTransactions: false,
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 100,
      timeout: 30000,
    };
  }

  private async _executeWithRetry<U>(
    operation: HandlerOperation,
    context: HandlerContext,
    input: unknown,
    fn: () => Promise<HandlerResult<U>>
  ): Promise<HandlerResult<U>> {
    const startTime = Date.now();
    this._stats.totalOperations++;
    this._incrementOperationCount(operation);

    let lastError: HandlerError | undefined;
    let attempt = 0;

    while (attempt <= this._config.maxRetries) {
      try {
        const result = await fn();
        const executionTime = Date.now() - startTime;

        if (result.success) {
          this._stats.successfulOperations++;
          this._updateAverageExecutionTime(executionTime);
          return result;
        } else {
          lastError = result.error;
          if (lastError?.retryable !== true || attempt === this._config.maxRetries) {
            this._stats.failedOperations++;
            this._updateAverageExecutionTime(executionTime);
            return result;
          }
        }
      } catch (error) {
        lastError = {
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown handler error',
          operation,
          retryable: true,
        };
      }

      attempt++;
      this._stats.retriedOperations++;

      if (attempt <= this._config.maxRetries && this._config.enableRetry) {
        await this._delay(this._config.retryDelay * attempt);
      }
    }

    this._stats.failedOperations++;
    this._updateAverageExecutionTime(Date.now() - startTime);

    return this._createErrorResult<U>(operation, 'HANDLER_ERROR', lastError?.message ?? 'Unknown handler error');
  }

  private async _executePipeline(
    context: HandlerContext,
    input: unknown,
    handlers: OperationHandler<T>[],
    preHandlers?: OperationHandler<T>[],
    postHandlers?: OperationHandler<T>[]
  ): Promise<HandlerResult<T>> {
    const startTime = Date.now();

    for (const handler of preHandlers ?? []) {
      const result = await handler.handle(context, input);
      if (!result.success) {
        return result;
      }
    }

    for (const handler of handlers) {
      const result = await handler.handle(context, input);
      if (!result.success) {
        return result;
      }
    }

    for (const handler of postHandlers ?? []) {
      const result = await handler.handle(context, input);
      if (!result.success) {
        return result;
      }
    }

    return {
      success: true,
      metrics: this._createMetrics(startTime),
      metadata: {},
    };
  }

  private _createErrorResult<U>(operation: HandlerOperation, code: string, message: string): HandlerResult<U> {
    return {
      success: false,
      error: {
        code,
        message,
        operation,
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
  }

  private _createMetrics(startTime: number): HandlerMetrics {
    return {
      executionTime: Date.now() - startTime,
      cacheHitRate: 0,
      databaseCalls: 0,
      validationTime: 0,
      middlewareTime: 0,
      memoryUsage: 0,
    };
  }

  private _incrementOperationCount(operation: HandlerOperation): void {
    const count = this._stats.operationCounts.get(operation) ?? 0;
    this._stats.operationCounts.set(operation, count + 1);
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalOperations;
    if (total > 0) {
      this._stats.averageExecutionTime = (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
