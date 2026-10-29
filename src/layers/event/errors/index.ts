/**
 * Event Errors
 *
 * Exports all event error classes.
 *
 * @module EventLayer/Errors
 */

export {
  EventError,
  EventPublishError,
  EventSubscribeError,
  EventSerializationError,
  EventHandlerError,
  EventQueueFullError,
  EventDeliveryTimeoutError,
  EventAdapterNotConnectedError,
  EventAdapterConnectionError,
  EventConfigurationError,
  EventStrategyError,
  EventDeadLetterQueueFullError,
  EventReplayError,
  EventFilteredError,
  EventPriorityQueueFullError,
  isEventError,
  getErrorCode,
  getErrorMessage,
} from './EventError';