/**
 * Routing Strategy Interface
 * 
 * Defines contract for different routing strategies.
 */

import { RouteEntity } from '../../domain/entities/RouteEntity';

export interface IRoutingStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Find matching route
   */
  findRoute(routes: RouteEntity[], path: string, method: string): RouteEntity | undefined;
}
