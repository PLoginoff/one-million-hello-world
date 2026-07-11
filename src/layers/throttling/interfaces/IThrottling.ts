/**
 * Throttling Interface
 *
 * Defines the contract for the Throttling and quota management layer.
 */

import { ThrottlingResult, ThrottlingContext } from '../types/throttling-types';

export interface IThrottling {
  /**
   * Execute the throttling operation
   */
  execute(context: ThrottlingContext): Promise<ThrottlingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
