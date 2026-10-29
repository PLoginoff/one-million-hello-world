/**
 * Error tests for Event layer
 */

import {
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
} from '../errors/EventError';

describe('EventError', () => {
  it('should create base error', () => {
    const error = new EventError('TEST_ERROR', 'Test message', { key: 'value' });
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.context).toEqual({ key: 'value' });
    expect(error.timestamp).toBeGreaterThan(0);
    expect(error.name).toBe('EventError');
  });

  it('should serialize to JSON', () => {
    const error = new EventError('TEST_ERROR', 'Test message', { key: 'value' });
    const json = error.toJSON();
    expect(json.name).toBe('EventError');
    expect(json.code).toBe('TEST_ERROR');
    expect(json.message).toBe('Test message');
    expect(json.context).toEqual({ key: 'value' });
    expect(json.timestamp).toBeDefined();
    expect(json.stack).toBeDefined();
  });

  it('should add context', () => {
    const error = new EventError('TEST_ERROR', 'Test message', { key: 'value' });
    const newError = error.withContext({ another: 'context' });
    expect(newError.context).toEqual({ key: 'value', another: 'context' });
    expect(newError.code).toBe('TEST_ERROR');
    expect(newError.message).toBe('Test message');
  });
});

describe('EventPublishError', () => {
  it('should create publish error', () => {
    const error = new EventPublishError('test-event', { data: 'test' }, 'Failed to publish');
    expect(error.code).toBe('EVENT_PUBLISH_ERROR');
    expect(error.eventName).toBe('test-event');
    expect(error.payload).toEqual({ data: 'test' });
    expect(error.message).toBe('Failed to publish');
  });

  it('should include context', () => {
    const error = new EventPublishError('test-event', { data: 'test' }, 'Failed', { adapter: 'redis' });
    expect(error.context.adapter).toBe('redis');
  });
});

describe('EventSubscribeError', () => {
  it('should create subscribe error', () => {
    const error = new EventSubscribeError('test-event', 'Failed to subscribe', { subscriptionId: 'sub-123' });
    expect(error.code).toBe('EVENT_SUBSCRIBE_ERROR');
    expect(error.eventName).toBe('test-event');
    expect(error.subscriptionId).toBe('sub-123');
  });
});

describe('EventSerializationError', () => {
  it('should create serialization error', () => {
    const error = new EventSerializationError('test-event', { data: 'test' }, 'json', 'Failed to serialize');
    expect(error.code).toBe('EVENT_SERIALIZATION_ERROR');
    expect(error.eventName).toBe('test-event');
    expect(error.payload).toEqual({ data: 'test' });
    expect(error.format).toBe('json');
  });
});

describe('EventHandlerError', () => {
  it('should create handler error', () => {
    const originalError = new Error('Handler crashed');
    const error = new EventHandlerError('test-event', originalError, 'Handler failed', { subscriptionId: 'sub-123' });
    expect(error.code).toBe('EVENT_HANDLER_ERROR');
    expect(error.eventName).toBe('test-event');
    expect(error.subscriptionId).toBe('sub-123');
    expect(error.originalError).toBe(originalError);
  });
});

describe('EventQueueFullError', () => {
  it('should create queue full error', () => {
    const error = new EventQueueFullError('test-event', 1000, 1000, 'Queue is full');
    expect(error.code).toBe('EVENT_QUEUE_FULL');
    expect(error.eventName).toBe('test-event');
    expect(error.queueSize).toBe(1000);
    expect(error.maxQueueSize).toBe(1000);
  });
});

describe('EventDeliveryTimeoutError', () => {
  it('should create delivery timeout error', () => {
    const error = new EventDeliveryTimeoutError('test-event', 5000, 'Delivery timed out', { subscriptionId: 'sub-123' });
    expect(error.code).toBe('EVENT_DELIVERY_TIMEOUT');
    expect(error.eventName).toBe('test-event');
    expect(error.timeoutMs).toBe(5000);
    expect(error.subscriptionId).toBe('sub-123');
  });
});

describe('EventAdapterNotConnectedError', () => {
  it('should create adapter not connected error', () => {
    const error = new EventAdapterNotConnectedError('redis', 'main', 'Redis not connected');
    expect(error.code).toBe('EVENT_ADAPTER_NOT_CONNECTED');
    expect(error.adapterType).toBe('redis');
    expect(error.adapterName).toBe('main');
  });
});

describe('EventAdapterConnectionError', () => {
  it('should create adapter connection error', () => {
    const originalError = new Error('Connection refused');
    const error = new EventAdapterConnectionError('redis', 'main', originalError, 'Failed to connect');
    expect(error.code).toBe('EVENT_ADAPTER_CONNECTION_ERROR');
    expect(error.adapterType).toBe('redis');
    expect(error.adapterName).toBe('main');
    expect(error.originalError).toBe(originalError);
  });
});

describe('EventConfigurationError', () => {
  it('should create configuration error', () => {
    const error = new EventConfigurationError('maxRetries', 100, 'Max retries too high');
    expect(error.code).toBe('EVENT_CONFIGURATION_ERROR');
    expect(error.field).toBe('maxRetries');
    expect(error.value).toBe(100);
  });
});

describe('EventStrategyError', () => {
  it('should create strategy error', () => {
    const error = new EventStrategyError('reliable', 'publish', 'test-event', 'Strategy failed');
    expect(error.code).toBe('EVENT_STRATEGY_ERROR');
    expect(error.strategyName).toBe('reliable');
    expect(error.operation).toBe('publish');
    expect(error.eventName).toBe('test-event');
  });
});

describe('EventDeadLetterQueueFullError', () => {
  it('should create dead letter queue full error', () => {
    const error = new EventDeadLetterQueueFullError('test-event', 10000, 10000, 'DLQ full');
    expect(error.code).toBe('EVENT_DEAD_LETTER_QUEUE_FULL');
    expect(error.eventName).toBe('test-event');
    expect(error.queueSize).toBe(10000);
    expect(error.maxQueueSize).toBe(10000);
  });
});

describe('EventReplayError', () => {
  it('should create replay error', () => {
    const originalError = new Error('Replay failed');
    const error = new EventReplayError('dlq-123', 'test-event', originalError, 'Failed to replay');
    expect(error.code).toBe('EVENT_REPLAY_ERROR');
    expect(error.entryId).toBe('dlq-123');
    expect(error.eventName).toBe('test-event');
    expect(error.originalError).toBe(originalError);
  });
});

describe('EventFilteredError', () => {
  it('should create filtered error', () => {
    const error = new EventFilteredError('test-event', 'rule-1', 'deny', 'Event filtered');
    expect(error.code).toBe('EVENT_FILTERED');
    expect(error.eventName).toBe('test-event');
    expect(error.ruleId).toBe('rule-1');
    expect(error.action).toBe('deny');
  });
});

describe('EventPriorityQueueFullError', () => {
  it('should create priority queue full error', () => {
    const error = new EventPriorityQueueFullError(100, 1000, 1000, 'Priority queue full');
    expect(error.code).toBe('EVENT_PRIORITY_QUEUE_FULL');
    expect(error.priority).toBe(100);
    expect(error.queueSize).toBe(1000);
    expect(error.maxQueueSize).toBe(1000);
  });
});

describe('Error utilities', () => {
  it('should identify EventError', () => {
    const eventError = new EventError('TEST', 'test');
    const regularError = new Error('regular');
    expect(isEventError(eventError)).toBe(true);
    expect(isEventError(regularError)).toBe(false);
    expect(isEventError('string')).toBe(false);
    expect(isEventError(null)).toBe(false);
  });

  it('should get error code from EventError', () => {
    const error = new EventError('CUSTOM_CODE', 'test');
    expect(getErrorCode(error)).toBe('CUSTOM_CODE');
  });

  it('should get error code from regular Error', () => {
    const error = new Error('test');
    expect(getErrorCode(error)).toBe('ERROR_ERROR');
  });

  it('should get error code from unknown', () => {
    expect(getErrorCode('string')).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
    expect(getErrorCode(123)).toBe('UNKNOWN_ERROR');
  });

  it('should get error message', () => {
    const eventError = new EventError('TEST', 'Event error message');
    const regularError = new Error('Regular error message');
    expect(getErrorMessage(eventError)).toBe('Event error message');
    expect(getErrorMessage(regularError)).toBe('Regular error message');
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(null)).toBe('null');
  });
});