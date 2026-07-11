/**
 * ChaosEngineering Interface
 *
 * Defines the contract for the Chaos engineering and fault injection layer.
 */

import { ChaosEngineeringResult, ChaosEngineeringContext } from '../types/chaos-engineering-types';

export interface IChaosEngineering {
  /**
   * Execute the chaosEngineering operation
   */
  execute(context: ChaosEngineeringContext): Promise<ChaosEngineeringResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
