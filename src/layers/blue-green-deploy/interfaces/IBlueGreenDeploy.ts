/**
 * BlueGreenDeploy Interface
 *
 * Defines the contract for the Blue-green deployment strategy layer.
 */

import { BlueGreenDeployResult, BlueGreenDeployContext } from '../types/blue-green-deploy-types';

export interface IBlueGreenDeploy {
  /**
   * Execute the blueGreenDeploy operation
   */
  execute(context: BlueGreenDeployContext): Promise<BlueGreenDeployResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
