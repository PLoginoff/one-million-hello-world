/**
 * Mfa Interface
 *
 * Defines the contract for the Multi-factor authentication layer.
 */

import { MfaResult, MfaContext } from '../types/mfa-types';

export interface IMfa {
  /**
   * Execute the mfa operation
   */
  execute(context: MfaContext): Promise<MfaResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
