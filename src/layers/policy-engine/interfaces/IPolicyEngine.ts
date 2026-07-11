/**
 * PolicyEngine Interface
 *
 * Defines the contract for the Policy evaluation engine layer.
 */

import { PolicyEngineResult, PolicyEngineContext } from '../types/policy-engine-types';

export interface IPolicyEngine {
  /**
   * Execute the policyEngine operation
   */
  execute(context: PolicyEngineContext): Promise<PolicyEngineResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
