/**
 * Configuration Interface
 *
 * Defines the contract for the Configuration management and dynamic settings layer.
 */

import { ConfigurationResult, ConfigurationContext } from '../types/configuration-types';

export interface IConfiguration {
  /**
   * Execute the configuration operation
   */
  execute(context: ConfigurationContext): Promise<ConfigurationResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
