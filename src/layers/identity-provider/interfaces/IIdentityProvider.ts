/**
 * IdentityProvider Interface
 *
 * Defines the contract for the Identity provider abstraction layer.
 */

import { IdentityProviderResult, IdentityProviderContext } from '../types/identity-provider-types';

export interface IIdentityProvider {
  /**
   * Execute the identityProvider operation
   */
  execute(context: IdentityProviderContext): Promise<IdentityProviderResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
