/**
 * Oauth2 Interface
 *
 * Defines the contract for the OAuth2 provider integration layer.
 */

import { Oauth2Result, Oauth2Context } from '../types/oauth2-types';

export interface IOauth2 {
  /**
   * Execute the oauth2 operation
   */
  execute(context: Oauth2Context): Promise<Oauth2Result<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
