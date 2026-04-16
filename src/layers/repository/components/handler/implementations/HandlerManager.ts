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

  async handleFind(context: HandlerContext, input: unknown): Promise<HandlerResult<T[]>> {
    return this._executeWithRetry(HandlerOperation.FIND, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.FIND, 'HANDLER_NOT_FOUND', 'No handler registered for FIND operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleFindById(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry(HandlerOperation.FIND_BY_ID, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND_BY_ID);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.FIND_BY_ID, 'HANDLER_NOT_FOUND', 'No handler registered for FIND_BY_ID operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleFindOne(context: HandlerContext, input: unknown): Promise<HandlerResult<T | null>> {
    return this._executeWithRetry(HandlerOperation.FIND_ONE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.FIND_ONE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.FIND_ONE, 'HANDLER_NOT_FOUND', 'No handler registered for FIND_ONE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleSave(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry(HandlerOperation.SAVE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.SAVE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.SAVE, 'HANDLER_NOT_FOUND', 'No handler registered for SAVE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleUpdate(context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executeWithRetry(HandlerOperation.UPDATE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.UPDATE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.UPDATE, 'HANDLER_NOT_FOUND', 'No handler registered for UPDATE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<void>> {
    return this._executeWithRetry(HandlerOperation.DELETE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.DELETE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.DELETE, 'HANDLER_NOT_FOUND', 'No handler registered for DELETE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleDeleteMany(context: HandlerContext, input: unknown): Promise<HandlerResult<number>> {
    return this._executeWithRetry(HandlerOperation.DELETE_MANY, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.DELETE_MANY);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.DELETE_MANY, 'HANDLER_NOT_FOUND', 'No handler registered for DELETE_MANY operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleCount(context: HandlerContext, input: unknown): Promise<HandlerResult<number>> {
    return this._executeWithRetry(HandlerOperation.COUNT, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.COUNT);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.COUNT, 'HANDLER_NOT_FOUND', 'No handler registered for COUNT operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleExists(context: HandlerContext, input: unknown): Promise<HandlerResult<boolean>> {
    return this._executeWithRetry(HandlerOperation.EXISTS, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.EXISTS);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.EXISTS, 'HANDLER_NOT_FOUND', 'No handler registered for EXISTS operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleAggregate(context: HandlerContext, input: unknown): Promise<HandlerResult<Record<string, unknown>>> {
    return this._executeWithRetry(HandlerOperation.AGGREGATE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.AGGREGATE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.AGGREGATE, 'HANDLER_NOT_FOUND', 'No handler registered for AGGREGATE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleBulkSave(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>> {
    return this._executeWithRetry(HandlerOperation.BULK_SAVE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.BULK_SAVE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.BULK_SAVE, 'HANDLER_NOT_FOUND', 'No handler registered for BULK_SAVE operation');
      }
      return handler.handle(context, input);
    });
  }

  async handleBulkDelete(context: HandlerContext, input: unknown): Promise<HandlerResult<BulkOperationResult<T>>> {
    return this._executeWithRetry(HandlerOperation.BULK_DELETE, context, input, async () => {
      const handler = this._handlers.get(HandlerOperation.BULK_DELETE);
      if (!handler) {
        return this._createErrorResult(HandlerOperation.BULK_DELETE, 'HANDLER_NOT_FOUND', 'No handler registered for BULK_DELETE operation');
      }
      return handler.handle(context, input);
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
      preHandlers: preHandlers || [],
      postHandlers: postHandlers || [],
      execute: async (context: HandlerContext, input: unknown): Promise<HandlerResult<T>> => {
        return this._executePipeline(context, input, handlers, preHandlers, postHandlers);
      },
    };
  }

  async executePipeline(pipeline: HandlerPipeline<T>, context: HandlerContext, input: unknown): Promise<HandlerResult<T>> {
    return this._executePipeline(context, input, pipeline.handlers, pipeline.preHandlers, pipeline.postHandlers);
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
      metadata: metadata || {},
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
          if (!lastError?.retryable || attempt === this._config.maxRetries) {
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

    return {
      success: false,
      error: lastError,
      metrics: this._createMetrics(startTime),
      metadata: {},
    };
  }

  private async _executePipeline(
    context: HandlerContext,
    input: unknown,
    handlers: OperationHandler<T>[],
    preHandlers?: OperationHandler<T>[],
    postHandlers?: OperationHandler<T>[]
  ): Promise<HandlerResult<T>> {
    const startTime = Date.now();

    for (const handler of preHandlers || []) {
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

    for (const handler of postHandlers || []) {
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

  private _createErrorResult(operation: HandlerOperation, code: string, message: string): HandlerResult<any> {
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
    const count = this._stats.operationCounts.get(operation) || 0;
    this._stats.operationCounts.set(operation, count + 1);
  }

  private _updateAverageExecutionTime(duration: number): void {
    const total = this._stats.totalOperations;
    if (total > 0) {
      this._stats.averageExecutionTime =
        (this._stats.averageExecutionTime * (total - 1) + duration) / total;
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
