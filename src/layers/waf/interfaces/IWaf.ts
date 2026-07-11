/**
 * Waf Interface
 *
 * Defines the contract for the Web Application Firewall layer.
 */

import { WafResult, WafContext } from '../types/waf-types';

export interface IWaf {
  /**
   * Execute the waf operation
   */
  execute(context: WafContext): Promise<WafResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
