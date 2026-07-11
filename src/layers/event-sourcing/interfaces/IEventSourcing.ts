/**
 * EventSourcing Interface
 *
 * Defines the contract for the Event sourcing and event store layer.
 */

import { EventSourcingResult, EventSourcingContext } from '../types/event-sourcing-types';

export interface IEventSourcing {
  /**
   * Execute the eventSourcing operation
   */
  execute(context: EventSourcingContext): Promise<EventSourcingResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
