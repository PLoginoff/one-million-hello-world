/**
 * Outbox Interface
 *
 * Defines the contract for the Transactional outbox pattern layer.
 */

import { OutboxResult, OutboxContext } from '../types/outbox-types';

export interface IOutbox {
  /**
   * Execute the outbox operation
   */
  execute(context: OutboxContext): Promise<OutboxResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
