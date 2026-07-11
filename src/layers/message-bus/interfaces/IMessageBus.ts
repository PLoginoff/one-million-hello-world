/**
 * MessageBus Interface
 *
 * Defines the contract for the Enterprise message bus and event streaming layer.
 */

import { MessageBusResult, MessageBusContext } from '../types/message-bus-types';

export interface IMessageBus {
  /**
   * Execute the messageBus operation
   */
  execute(context: MessageBusContext): Promise<MessageBusResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
