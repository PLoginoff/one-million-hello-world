/**
 * Middleware Chain Service
 * 
 * Manages middleware execution chain.
 */

import { MiddlewareEntity } from '../entities/MiddlewareEntity';
import { MiddlewareContextEntity } from '../entities/MiddlewareContextEntity';
import { MiddlewareExecutionOrderValueObject } from '../value-objects/MiddlewareExecutionOrderValueObject';

export type MiddlewareFunction = (context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity;

export class MiddlewareChainService {
  private middlewares: Map<string, MiddlewareEntity>;
  private handlers: Map<string, MiddlewareFunction>;

  constructor() {
    this.middlewares = new Map();
    this.handlers = new Map();
  }

  /**
   * Add middleware to chain
   */
  addMiddleware(entity: MiddlewareEntity, handler: MiddlewareFunction): void {
    this.middlewares.set(entity.data.id, entity);
    this.handlers.set(entity.data.id, handler);
  }

  /**
   * Remove middleware from chain
   */
  removeMiddleware(middlewareId: string): void {
    this.middlewares.delete(middlewareId);
    this.handlers.delete(middlewareId);
  }

  /**
   * Get middleware entity
   */
  getMiddleware(middlewareId: string): MiddlewareEntity | undefined {
    return this.middlewares.get(middlewareId);
  }

  /**
   * Execute middleware chain
   */
  async executeChain(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    const sortedMiddlewares = this.getSortedMiddlewares();
    let currentContext = context;

    for (const middleware of sortedMiddlewares) {
      if (!middleware.isEnabled()) continue;

      const handler = this.handlers.get(middleware.data.id);
      if (!handler) continue;

      currentContext = await handler(currentContext);
    }

    return currentContext;
  }

  /**
   * Get sorted middlewares by priority
   */
  private getSortedMiddlewares(): MiddlewareEntity[] {
    return Array.from(this.middlewares.values())
      .filter(m => m.isEnabled())
      .sort((a, b) => a.data.priority - b.data.priority);
  }

  /**
   * Get all middlewares
   */
  getAllMiddlewares(): MiddlewareEntity[] {
    return Array.from(this.middlewares.values());
  }

  /**
   * Get middleware count
   */
  getMiddlewareCount(): number {
    return this.middlewares.size;
  }

  /**
   * Clear all middlewares
   */
  clear(): void {
    this.middlewares.clear();
    this.handlers.clear();
  }
}
