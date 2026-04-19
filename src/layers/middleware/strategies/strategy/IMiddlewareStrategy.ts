/**
 * Middleware Strategy Interface
 * 
 * Defines contract for different middleware execution strategies.
 */

import { MiddlewareContextEntity } from '../../domain/entities/MiddlewareContextEntity';

export interface IMiddlewareStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Execute middleware with context
   */
  execute(context: MiddlewareContextEntity): Promise<MiddlewareContextEntity> | MiddlewareContextEntity;
}
