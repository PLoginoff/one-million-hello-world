/**
 * Graphql Interface
 *
 * Defines the contract for the GraphQL query parsing and resolver orchestration layer.
 */

import { GraphqlResult, GraphqlContext } from '../types/graphql-types';

export interface IGraphql {
  /**
   * Execute the graphql operation
   */
  execute(context: GraphqlContext): Promise<GraphqlResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
