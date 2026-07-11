/**
 * RulesEngine Interface
 *
 * Defines the contract for the Business rules engine layer.
 */

import { RulesEngineResult, RulesEngineContext } from '../types/rules-engine-types';

export interface IRulesEngine {
  /**
   * Execute the rulesEngine operation
   */
  execute(context: RulesEngineContext): Promise<RulesEngineResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
