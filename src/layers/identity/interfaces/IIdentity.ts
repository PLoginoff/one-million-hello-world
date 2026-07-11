/**
 * Identity Interface
 *
 * Defines the contract for the Identity and user management layer.
 */

import { IdentityResult, IdentityContext } from '../types/identity-types';

export interface IIdentity {
  /**
   * Execute the identity operation
   */
  execute(context: IdentityContext): Promise<IdentityResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
