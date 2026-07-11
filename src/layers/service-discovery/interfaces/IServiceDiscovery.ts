/**
 * ServiceDiscovery Interface
 *
 * Defines the contract for the Service discovery and registration layer.
 */

import { ServiceDiscoveryResult, ServiceDiscoveryContext } from '../types/service-discovery-types';

export interface IServiceDiscovery {
  /**
   * Execute the serviceDiscovery operation
   */
  execute(context: ServiceDiscoveryContext): Promise<ServiceDiscoveryResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
