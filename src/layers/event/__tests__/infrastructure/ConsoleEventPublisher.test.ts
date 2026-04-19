/**
 * ConsoleEventPublisher Unit Tests
 * 
 * Comprehensive tests for ConsoleEventPublisher infrastructure implementation.
 * Tests cover publishing, connection management, and edge cases.
 */

import { ConsoleEventPublisher } from '../../infrastructure/implementations/ConsoleEventPublisher';
import { Event } from '../../domain/entities/Event';

describe('ConsoleEventPublisher', () => {
  let publisher: ConsoleEventPublisher;

  beforeEach(() => {
    publisher = new ConsoleEventPublisher();
  });

  describe('constructor', () => {
    it('should create with default prefix', () => {
      const pub = new ConsoleEventPublisher();
      expect(pub).toBeDefined();
    });

    it('should create with custom prefix', () => {
      const pub = new ConsoleEventPublisher('[CustomPrefix]');
      expect(pub).toBeDefined();
    });

    it('should start connected', () => {
      expect(publisher.isConnected()).toBe(true);
    });
  });

  describe('publish', () => {
    it('should publish event successfully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = Event.create('test.event', { data: 'test' });

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      expect(result.eventId).toBe(event.id.value);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log event details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = Event.create('test.event', { userId: '123' });

      await publisher.publish(event);

      const loggedData = consoleSpy.mock.calls[0][1];
      expect(loggedData.id).toBe(event.id.value);
      expect(loggedData.type).toBe(event.type.value);
      expect(loggedData.payload).toEqual(event.payload.data);
      consoleSpy.mockRestore();
    });

    it('should include metadata in log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = Event.create('test.event', {});

      await publisher.publish(event);

      const loggedData = consoleSpy.mock.calls[0][1];
      expect(loggedData.metadata).toBeDefined();
      expect(loggedData.occurredAt).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('should use custom prefix', async () => {
      const customPub = new ConsoleEventPublisher('[Custom]');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = Event.create('test.event', {});

      await customPub.publish(event);

      expect(consoleSpy.mock.calls[0][0]).toBe('[Custom]');
      consoleSpy.mockRestore();
    });

    it('should return error when disconnected', async () => {
      await publisher.disconnect();
      const event = Event.create('test.event', {});

      const result = await publisher.publish(event);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBe('Publisher is not connected');
    });

    it('should handle events with complex payloads', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);

      await publisher.publish(event);

      const loggedData = consoleSpy.mock.calls[0][1];
      expect(loggedData.payload).toEqual(complexPayload);
      consoleSpy.mockRestore();
    });
  });

  describe('publishBatch', () => {
    it('should publish multiple events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      const results = await publisher.publishBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it('should return results for all events', async () => {
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      const results = await publisher.publishBatch(events);

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.eventId).toBe(events[i].id.value);
      });
    });

    it('should handle empty batch', async () => {
      const results = await publisher.publishBatch([]);
      expect(results).toEqual([]);
    });

    it('should handle single event batch', async () => {
      const events = [Event.create('event1', {})];
      const results = await publisher.publishBatch(events);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should handle partial failures when disconnected', async () => {
      await publisher.disconnect();
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      const results = await publisher.publishBatch(events);

      expect(results).toHaveLength(3);
      expect(results.every(r => !r.success)).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', () => {
      expect(publisher.isConnected()).toBe(true);
    });

    it('should return false when disconnected', async () => {
      await publisher.disconnect();
      expect(publisher.isConnected()).toBe(false);
    });

    it('should return true after reconnecting', async () => {
      await publisher.disconnect();
      await publisher.connect();
      expect(publisher.isConnected()).toBe(true);
    });
  });

  describe('connect', () => {
    it('should connect publisher', async () => {
      await publisher.disconnect();
      await publisher.connect();

      expect(publisher.isConnected()).toBe(true);
    });

    it('should handle connecting when already connected', async () => {
      await expect(publisher.connect()).resolves.not.toThrow();
      expect(publisher.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect publisher', async () => {
      await publisher.disconnect();
      expect(publisher.isConnected()).toBe(false);
    });

    it('should handle disconnecting when already disconnected', async () => {
      await publisher.disconnect();
      await expect(publisher.disconnect()).resolves.not.toThrow();
      expect(publisher.isConnected()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle publishing many events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const events = Array.from({ length: 100 }, (_, i) => 
        Event.create(`event${i}`, {})
      );

      const results = await publisher.publishBatch(events);

      expect(results).toHaveLength(100);
      expect(results.every(r => r.success)).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle event with very long payload', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const longPayload = { data: 'a'.repeat(10000) };
      const event = Event.create('test.event', longPayload);

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle event with special characters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const specialPayload = { data: 'test\n\t\r' };
      const event = Event.create('test.event', specialPayload);

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle event with unicode characters', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const unicodePayload = { data: 'тест' };
      const event = Event.create('test.event', unicodePayload);

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle event with null payload', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const event = Event.create('test.event', null);

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle event with array payload', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const arrayPayload = [1, 2, 3, 4, 5];
      const event = Event.create('test.event', arrayPayload);

      const result = await publisher.publish(event);

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});
