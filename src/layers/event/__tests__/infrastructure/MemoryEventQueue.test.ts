/**
 * MemoryEventQueue Unit Tests
 * 
 * Comprehensive tests for MemoryEventQueue infrastructure implementation.
 * Tests cover queue operations, processing, statistics, and edge cases.
 */

import { MemoryEventQueue } from '../../infrastructure/implementations/MemoryEventQueue';
import { Event } from '../../domain/entities/Event';

describe('MemoryEventQueue', () => {
  let queue: MemoryEventQueue;

  beforeEach(() => {
    queue = new MemoryEventQueue();
  });

  describe('constructor', () => {
    it('should create queue', () => {
      expect(queue).toBeDefined();
    });
  });

  describe('setProcessor', () => {
    it('should set processor function', () => {
      const processor = jest.fn();
      queue.setProcessor(processor);
      expect(() => queue.setProcessor(processor)).not.toThrow();
    });
  });

  describe('enqueue', () => {
    it('should add event to queue', async () => {
      const event = Event.create('test.event', { data: 'test' });
      await queue.enqueue(event);

      const size = await queue.size();
      expect(size).toBe(1);
    });

    it('should update stats size', async () => {
      const event = Event.create('test.event', {});
      await queue.enqueue(event);

      const stats = queue.getStats();
      expect(stats.size).toBe(1);
    });

    it('should handle multiple events', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.enqueue(Event.create('event2', {}));
      await queue.enqueue(Event.create('event3', {}));

      const size = await queue.size();
      expect(size).toBe(3);
    });

    it('should maintain FIFO order', async () => {
      const event1 = Event.create('event1', { id: 1 });
      const event2 = Event.create('event2', { id: 2 });
      const event3 = Event.create('event3', { id: 3 });

      await queue.enqueue(event1);
      await queue.enqueue(event2);
      await queue.enqueue(event3);

      const dequeued1 = await queue.dequeue();
      const dequeued2 = await queue.dequeue();
      const dequeued3 = await queue.dequeue();

      expect(dequeued1!.payload.data).toEqual({ id: 1 });
      expect(dequeued2!.payload.data).toEqual({ id: 2 });
      expect(dequeued3!.payload.data).toEqual({ id: 3 });
    });
  });

  describe('enqueueBatch', () => {
    it('should add multiple events to queue', async () => {
      const events = [
        Event.create('event1', {}),
        Event.create('event2', {}),
        Event.create('event3', {}),
      ];

      await queue.enqueueBatch(events);

      const size = await queue.size();
      expect(size).toBe(3);
    });

    it('should handle empty batch', async () => {
      await queue.enqueueBatch([]);
      const size = await queue.size();
      expect(size).toBe(0);
    });

    it('should handle single event batch', async () => {
      const events = [Event.create('event1', {})];
      await queue.enqueueBatch(events);

      const size = await queue.size();
      expect(size).toBe(1);
    });
  });

  describe('dequeue', () => {
    it('should remove and return first event', async () => {
      const event = Event.create('test.event', {});
      await queue.enqueue(event);

      const dequeued = await queue.dequeue();
      expect(dequeued).toBeDefined();
      expect(dequeued!.id.value).toBe(event.id.value);

      const size = await queue.size();
      expect(size).toBe(0);
    });

    it('should return undefined for empty queue', async () => {
      const dequeued = await queue.dequeue();
      expect(dequeued).toBeUndefined();
    });

    it('should maintain order across multiple dequeues', async () => {
      const event1 = Event.create('event1', { id: 1 });
      const event2 = Event.create('event2', { id: 2 });

      await queue.enqueue(event1);
      await queue.enqueue(event2);

      const dequeued1 = await queue.dequeue();
      const dequeued2 = await queue.dequeue();

      expect(dequeued1!.payload.data).toEqual({ id: 1 });
      expect(dequeued2!.payload.data).toEqual({ id: 2 });
    });
  });

  describe('peek', () => {
    it('should return first event without removing', async () => {
      const event = Event.create('test.event', {});
      await queue.enqueue(event);

      const peeked = await queue.peek();
      expect(peeked).toBeDefined();
      expect(peeked!.id.value).toBe(event.id.value);

      const size = await queue.size();
      expect(size).toBe(1);
    });

    it('should return undefined for empty queue', async () => {
      const peeked = await queue.peek();
      expect(peeked).toBeUndefined();
    });

    it('should return same event on multiple peeks', async () => {
      const event = Event.create('test.event', {});
      await queue.enqueue(event);

      const peeked1 = await queue.peek();
      const peeked2 = await queue.peek();

      expect(peeked1!.id.value).toBe(peeked2!.id.value);
    });
  });

  describe('size', () => {
    it('should return 0 for empty queue', async () => {
      const size = await queue.size();
      expect(size).toBe(0);
    });

    it('should return current queue size', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.enqueue(Event.create('event2', {}));
      await queue.enqueue(Event.create('event3', {}));

      const size = await queue.size();
      expect(size).toBe(3);
    });

    it('should update after dequeue', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.enqueue(Event.create('event2', {}));

      await queue.dequeue();

      const size = await queue.size();
      expect(size).toBe(1);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty queue', async () => {
      const isEmpty = await queue.isEmpty();
      expect(isEmpty).toBe(true);
    });

    it('should return false for non-empty queue', async () => {
      await queue.enqueue(Event.create('event1', {}));

      const isEmpty = await queue.isEmpty();
      expect(isEmpty).toBe(false);
    });

    it('should return true after dequeuing all events', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.dequeue();

      const isEmpty = await queue.isEmpty();
      expect(isEmpty).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all events', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.enqueue(Event.create('event2', {}));
      await queue.enqueue(Event.create('event3', {}));

      await queue.clear();

      const size = await queue.size();
      expect(size).toBe(0);
    });

    it('should reset stats size', async () => {
      await queue.enqueue(Event.create('event1', {}));
      await queue.clear();

      const stats = queue.getStats();
      expect(stats.size).toBe(0);
    });

    it('should handle clearing empty queue', async () => {
      await expect(queue.clear()).resolves.not.toThrow();
      const size = await queue.size();
      expect(size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = queue.getStats();
      expect(stats.size).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.avgProcessingTime).toBe(0);
    });

    it('should update size stat', async () => {
      await queue.enqueue(Event.create('event1', {}));

      const stats = queue.getStats();
      expect(stats.size).toBe(1);
    });
  });

  describe('startProcessing', () => {
    it('should start processing with processor', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processor).toHaveBeenCalled();
    });

    it('should process events in order', async () => {
      const order: number[] = [];
      const processor = jest.fn(async (event) => {
        order.push((event.payload.data as any).id);
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', { id: 1 }));
      await queue.enqueue(Event.create('event2', { id: 2 }));
      await queue.enqueue(Event.create('event3', { id: 3 }));

      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(order).toEqual([1, 2, 3]);
    });

    it('should update processed stat', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = queue.getStats();
      expect(stats.processed).toBeGreaterThan(0);
    });

    it('should update failed stat on error', async () => {
      const processor = jest.fn().mockRejectedValue(new Error('Error'));
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = queue.getStats();
      expect(stats.failed).toBeGreaterThan(0);
    });

    it('should update avg processing time', async () => {
      const processor = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = queue.getStats();
      expect(stats.avgProcessingTime).toBeGreaterThan(0);
    });

    it('should stop when queue is empty', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(queue.isProcessing()).toBe(false);
    });

    it('should handle starting when already processing', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(processor).toHaveBeenCalled();
    });
  });

  describe('stopProcessing', () => {
    it('should stop processing', async () => {
      const processor = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();
      await queue.stopProcessing();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(queue.isProcessing()).toBe(false);
    });

    it('should handle stopping when not processing', async () => {
      await expect(queue.stopProcessing()).resolves.not.toThrow();
      expect(queue.isProcessing()).toBe(false);
    });
  });

  describe('isProcessing', () => {
    it('should return false initially', () => {
      expect(queue.isProcessing()).toBe(false);
    });

    it('should return true when processing', async () => {
      const processor = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      expect(queue.isProcessing()).toBe(true);
      await queue.stopProcessing();
    });
  });

  describe('edge cases', () => {
    it('should handle enqueueing many events', async () => {
      const count = 10000;
      for (let i = 0; i < count; i++) {
        await queue.enqueue(Event.create(`event${i}`, {}));
      }

      const size = await queue.size();
      expect(size).toBe(count);
    });

    it('should handle dequeuing many events', async () => {
      const count = 1000;
      for (let i = 0; i < count; i++) {
        await queue.enqueue(Event.create(`event${i}`, {}));
      }

      for (let i = 0; i < count; i++) {
        await queue.dequeue();
      }

      const size = await queue.size();
      expect(size).toBe(0);
    });

    it('should handle events with complex payloads', async () => {
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
      };
      const event = Event.create('test.event', complexPayload);
      await queue.enqueue(event);

      const dequeued = await queue.dequeue();
      expect(dequeued!.payload.data).toEqual(complexPayload);
    });

    it('should handle concurrent enqueues', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(queue.enqueue(Event.create(`event${i}`, {})));
      }

      await Promise.all(promises);

      const size = await queue.size();
      expect(size).toBe(100);
    });

    it('should handle processor throwing error', async () => {
      const processor = jest.fn(() => {
        throw new Error('Processor error');
      });
      queue.setProcessor(processor);

      await queue.enqueue(Event.create('event1', {}));
      await queue.startProcessing();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = queue.getStats();
      expect(stats.failed).toBeGreaterThan(0);
      expect(stats.processed).toBe(0);
    });
  });
});
