/**
 * DeadLetter Interface
 *
 * Defines the contract for the Dead letter queue management layer.
 */

import { DeadLetterResult, DeadLetterContext } from '../types/dead-letter-types';

export interface IDeadLetter {
  /**
   * Execute the deadLetter operation
   */
  execute(context: DeadLetterContext): Promise<DeadLetterResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
