/**
 * Serialization Event Emitter Tests
 */

import { SerializationEventEmitter } from '../../events/SerializationEventEmitter';
import { SerializationEventType } from '../../events/SerializationEventType';

describe('SerializationEventEmitter', () => {
  let emitter: SerializationEventEmitter;

  beforeEach(() => {
    emitter = new SerializationEventEmitter();
  });

  describe('Event Subscription', () => {
    it('should subscribe to event', () => {
      const handler = jest.fn();
      emitter.on(SerializationEventType.SERIALIZE_START, handler);
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe from event', () => {
      const handler = jest.fn();
      const subscription = emitter.on(SerializationEventType.SERIALIZE_START, handler);
      subscription.unsubscribe();
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should subscribe to multiple events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      emitter.on(SerializationEventType.SERIALIZE_START, handler1);
      emitter.on(SerializationEventType.SERIALIZE_END, handler2);
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      emitter.emit(SerializationEventType.SERIALIZE_END, {});
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Event Emission', () => {
    it('should emit event with data', () => {
      const handler = jest.fn();
      emitter.on(SerializationEventType.SERIALIZE_START, handler);
      const data = { format: 'json' };
      emitter.emit(SerializationEventType.SERIALIZE_START, data);
      expect(handler).toHaveBeenCalledWith(data);
    });

    it('should emit to all subscribers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      emitter.on(SerializationEventType.SERIALIZE_START, handler1);
      emitter.on(SerializationEventType.SERIALIZE_START, handler2);
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Async Events', () => {
    it('should handle async handlers', async () => {
      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      emitter.on(SerializationEventType.SERIALIZE_START, handler);
      await emitter.emitAsync(SerializationEventType.SERIALIZE_START, {});
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Once Subscription', () => {
    it('should only call handler once', () => {
      const handler = jest.fn();
      emitter.once(SerializationEventType.SERIALIZE_START, handler);
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Clear', () => {
    it('should clear all event listeners', () => {
      const handler = jest.fn();
      emitter.on(SerializationEventType.SERIALIZE_START, handler);
      emitter.clear();
      emitter.emit(SerializationEventType.SERIALIZE_START, {});
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
