/**
 * QueryObject Interface
 *
 * Defines the contract for the Query object and specification queries layer.
 */

import { QueryObjectResult, QueryObjectContext } from '../types/query-object-types';

export interface IQueryObject {
  /**
   * Execute the queryObject operation
   */
  execute(context: QueryObjectContext): Promise<QueryObjectResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
