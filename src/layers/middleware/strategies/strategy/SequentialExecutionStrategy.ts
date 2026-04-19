/**
 * Sequential Execution Strategy
 * 
 * Executes middlewares sequentially.
 */

import { IMiddlewareStrategy } from './IMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export class SequentialExecutionStrategy implements IMiddlewareStrategy {
  private handlers: Array<(context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity>;

  constructor() {
    this.handlers = [];
  }

  getName(): string {
    return 'SEQUENTIAL_EXECUTION';
  }

  /**
   * Add handler to strategy
   */
  addHandler(handler: (context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity): void {
    this.handlers.push(handler);
  }

  /**
   * Execute all handlers sequentially
   */
  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    let currentContext = context;

    for (const handler of this.handlers) {
      currentContext = await handler(currentContext);
    }

    return currentContext;
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
