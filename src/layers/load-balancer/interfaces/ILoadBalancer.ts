/**
 * LoadBalancer Interface
 *
 * Defines the contract for the Load balancing and traffic distribution layer.
 */

import { LoadBalancerResult, LoadBalancerContext } from '../types/load-balancer-types';

export interface ILoadBalancer {
  /**
   * Execute the loadBalancer operation
   */
  execute(context: LoadBalancerContext): Promise<LoadBalancerResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
