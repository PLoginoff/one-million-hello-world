/**
 * Siem Interface
 *
 * Defines the contract for the Security information and event management layer.
 */

import { SiemResult, SiemContext } from '../types/siem-types';

export interface ISiem {
  /**
   * Execute the siem operation
   */
  execute(context: SiemContext): Promise<SiemResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
