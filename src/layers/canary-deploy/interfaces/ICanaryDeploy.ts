/**
 * CanaryDeploy Interface
 *
 * Defines the contract for the Canary deployment and rollout gating layer.
 */

import { CanaryDeployResult, CanaryDeployContext } from '../types/canary-deploy-types';

export interface ICanaryDeploy {
  /**
   * Execute the canaryDeploy operation
   */
  execute(context: CanaryDeployContext): Promise<CanaryDeployResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
