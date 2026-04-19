/**
 * IEventExecutor - Core Interface
 * 
 * Interface for executing event handlers.
 * Handles synchronous and asynchronous execution with error handling.
 */

import { Event } from '../../domain/entities/Event';
import { EventHandler } from './IEventBus';

export interface ExecutionResult {
  success: boolean;
  handlerExecuted: boolean;
  error?: Error;
  executionTime: number;
}

export interface IEventExecutor {
  execute<T>(event: Event<T>, handler: EventHandler<T>): ExecutionResult;
  executeAsync<T>(event: Event<T>, handler: EventHandler<T>): Promise<ExecutionResult>;
  executeBatch<T>(event: Event<T>, handlers: EventHandler<T>[]): ExecutionResult[];
  executeBatchAsync<T>(event: Event<T>, handlers: EventHandler<T>[]): Promise<ExecutionResult[]>;
}
