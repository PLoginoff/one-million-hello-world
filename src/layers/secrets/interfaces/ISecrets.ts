/**
 * Secrets Interface
 *
 * Defines the contract for the Secrets management and vault abstraction layer.
 */

import { SecretsResult, SecretsContext } from '../types/secrets-types';

export interface ISecrets {
  /**
   * Execute the secrets operation
   */
  execute(context: SecretsContext): Promise<SecretsResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
