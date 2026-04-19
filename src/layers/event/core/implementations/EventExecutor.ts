/**
 * EventExecutor - Core Implementation
 * 
 * Executes event handlers with performance tracking and error handling.
 * Supports both synchronous and asynchronous execution modes.
 */

import { IEventExecutor, ExecutionResult } from '../interfaces';
import { Event } from '../../domain/entities/Event';
import { EventHandler } from '../interfaces';
import { IErrorHandler, ErrorContext } from '../interfaces';

export class EventExecutor implements IEventExecutor {
  private _errorHandler: IErrorHandler;

  constructor(errorHandler: IErrorHandler) {
    this._errorHandler = errorHandler;
  }

  execute<T>(event: Event<T>, handler: EventHandler<T>): ExecutionResult {
    const startTime = performance.now();
    
    try {
      handler(event);
      const executionTime = performance.now() - startTime;
      
      return {
        success: true,
        handlerExecuted: true,
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      const errorContext: ErrorContext = {
        eventType: event.type.value,
        subscriptionId: 'unknown',
        error: error as Error,
        timestamp: new Date(),
        eventData: event.payload.data,
      };
      
      this._errorHandler.handle(errorContext);
      
      return {
        success: false,
        handlerExecuted: true,
        error: error as Error,
        executionTime,
      };
    }
  }

  async executeAsync<T>(event: Event<T>, handler: EventHandler<T>): Promise<ExecutionResult> {
    const startTime = performance.now();
    
    try {
      await handler(event);
      const executionTime = performance.now() - startTime;
      
      return {
        success: true,
        handlerExecuted: true,
        executionTime,
      };
    } catch (error) {
      const executionTime = performance.now() - startTime;
      const errorContext: ErrorContext = {
        eventType: event.type.value,
        subscriptionId: 'unknown',
        error: error as Error,
        timestamp: new Date(),
        eventData: event.payload.data,
      };
      
      this._errorHandler.handle(errorContext);
      
      return {
        success: false,
        handlerExecuted: true,
        error: error as Error,
        executionTime,
      };
    }
  }

  executeBatch<T>(event: Event<T>, handlers: EventHandler<T>[]): ExecutionResult[] {
    return handlers.map(handler => this.execute(event, handler));
  }

  async executeBatchAsync<T>(event: Event<T>, handlers: EventHandler<T>[]): Promise<ExecutionResult[]> {
    const promises = handlers.map(handler => this.executeAsync(event, handler));
    return Promise.all(promises);
  }
}
