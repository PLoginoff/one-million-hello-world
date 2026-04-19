/**
 * Middleware Pipeline Service
 * 
 * Manages middleware pipeline with order control.
 */

import { MiddlewareEntity } from '../entities/MiddlewareEntity';
import { MiddlewareContextEntity } from '../entities/MiddlewareContextEntity';
import { MiddlewareExecutionOrderValueObject } from '../value-objects/MiddlewareExecutionOrderValueObject';

export type PipelineHandler = (context: MiddlewareContextEntity) => Promise<MiddlewareContextEntity> | MiddlewareContextEntity;

export class MiddlewarePipelineService {
  private middlewares: Array<{
    entity: MiddlewareEntity;
    handler: PipelineHandler;
    order: MiddlewareExecutionOrderValueObject;
  }>;

  constructor() {
    this.middlewares = [];
  }

  /**
   * Add middleware to pipeline
   */
  add(
    entity: MiddlewareEntity,
    handler: PipelineHandler,
    order: MiddlewareExecutionOrderValueObject = MiddlewareExecutionOrderValueObject.last()
  ): void {
    this.middlewares.push({ entity, handler, order });
    this.reorder();
  }

  /**
   * Remove middleware from pipeline
   */
  remove(middlewareId: string): void {
    this.middlewares = this.middlewares.filter(m => m.entity.data.id !== middlewareId);
  }

  /**
   * Execute pipeline
   */
  async execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> {
    let currentContext = context;

    for (const { entity, handler } of this.middlewares) {
      if (!entity.isEnabled()) continue;
      currentContext = await handler(currentContext);
    }

    return currentContext;
  }

  /**
   * Reorder middlewares based on execution order
   */
  private reorder(): void {
    const first = this.middlewares.filter(m => m.order.isFirst());
    const last = this.middlewares.filter(m => m.order.isLast());
    const others = this.middlewares.filter(m => !m.order.isFirst() && !m.order.isLast());

    others.sort((a, b) => {
      if (a.order.isBefore() && b.order.isAfter()) return -1;
      if (a.order.isAfter() && b.order.isBefore()) return 1;
      return a.entity.data.priority - b.entity.data.priority;
    });

    this.middlewares = [...first, ...others, ...last];
  }

  /**
   * Get all middlewares
   */
  getAll(): Array<{
    entity: MiddlewareEntity;
    handler: PipelineHandler;
    order: MiddlewareExecutionOrderValueObject;
  }> {
    return [...this.middlewares];
  }

  /**
   * Clear pipeline
   */
  clear(): void {
    this.middlewares = [];
  }
}
