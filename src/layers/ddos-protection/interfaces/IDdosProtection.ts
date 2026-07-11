/**
 * DdosProtection Interface
 *
 * Defines the contract for the DDoS protection layer layer.
 */

import { DdosProtectionResult, DdosProtectionContext } from '../types/ddos-protection-types';

export interface IDdosProtection {
  /**
   * Execute the ddosProtection operation
   */
  execute(context: DdosProtectionContext): Promise<DdosProtectionResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
