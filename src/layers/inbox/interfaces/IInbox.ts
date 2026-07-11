/**
 * Inbox Interface
 *
 * Defines the contract for the Inbox pattern for idempotent consumers layer.
 */

import { InboxResult, InboxContext } from '../types/inbox-types';

export interface IInbox {
  /**
   * Execute the inbox operation
   */
  execute(context: InboxContext): Promise<InboxResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
