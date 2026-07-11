/**
 * Authorization Interface
 *
 * Defines the contract for the Authorization and policy enforcement layer.
 */

import { AuthorizationResult, AuthorizationContext } from '../types/authorization-types';

export interface IAuthorization {
  /**
   * Execute the authorization operation
   */
  execute(context: AuthorizationContext): Promise<AuthorizationResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
