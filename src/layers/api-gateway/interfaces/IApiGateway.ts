/**
 * ApiGateway Interface
 *
 * Defines the contract for the API gateway abstraction, routing, and transformation layer.
 */

import { ApiGatewayResult, ApiGatewayContext } from '../types/api-gateway-types';

export interface IApiGateway {
  /**
   * Execute the apiGateway operation
   */
  execute(context: ApiGatewayContext): Promise<ApiGatewayResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
