/**
 * Sso Interface
 *
 * Defines the contract for the Single sign-on integration layer.
 */

import { SsoResult, SsoContext } from '../types/sso-types';

export interface ISso {
  /**
   * Execute the sso operation
   */
  execute(context: SsoContext): Promise<SsoResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
