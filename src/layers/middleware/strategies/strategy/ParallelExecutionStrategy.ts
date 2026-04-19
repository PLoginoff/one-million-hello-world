/**
 * Parallel Execution Strategy
 * 
 * Executes independent middlewares in parallel.
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export class ParallelExecutionStrategy implements IMiddlewareStrategy {
  private handlers: Array<(context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity>;

  constructor() {
    this.handlers = [];
  }

  getName(): string {
    return 'PARALLEL_EXECUTION';
  }

  /**
   * Add handler to strategy
   */
  addHandler(handler: (context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity): void {
    this.handlers.push(handler);
  }

  /**
   * Execute all handlers in parallel
   */
  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const results = await Promise.all(
      this.handlers.map(handler => handler(context))
    );

    return results[results.length - 1] || context;
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers = [];
  }

  /**
   * Get handler count
   */
  getHandlerCount(): number {
    return this.handlers.length;
  }
}
