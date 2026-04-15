/**
 * Message Queue Unit Tests
 * 
 * Tests for MessageQueue implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { MessageQueue } from '../implementations/MessageQueue';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  beforeEach(() => {
    queue = new MessageQueue();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = queue.getConfig();

      expect(config).toBeDefined();
      expect(config.maxRetries).toBe(3);
      expect(config.enableDeadLetter).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxRetries: 5,
        retryDelay: 2000,
        enableDeadLetter: false,
        maxQueueSize: 500,
      };

      queue.setConfig(newConfig);
      const config = queue.getConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.enableDeadLetter).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('should enqueue a message', () => {
      const result = queue.enqueue('test-data');

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should fail when queue is full', () => {
      queue.setConfig({ maxRetries: 3, retryDelay: 1000, enableDeadLetter: true, maxQueueSize: 1 });
      queue.enqueue('data1');
      const result = queue.enqueue('data2');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Queue is full');
    });
  });

  describe('dequeue', () => {
    it('should dequeue and process message', async () => {
      const handler = jest.fn();
      queue.enqueue('test-data');
      await queue.dequeue(handler);

      expect(handler).toHaveBeenCalledWith('test-data');
    });

    it('should handle empty queue', async () => {
      const handler = jest.fn();
      await queue.dequeue(handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('registerHandler and start', () => {
    it('should register handler and start processing', () => {
      const handler = jest.fn();
      queue.registerHandler(handler);
      queue.enqueue('test-data');
      queue.start();

      queue.stop();
    });
  });

  describe('getStats', () => {
    it('should track statistics', () => {
      queue.enqueue('data1');
      queue.enqueue('data2');

      const stats = queue.getStats();

      expect(stats.queuedCount).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear the queue', () => {
      queue.enqueue('data1');
      queue.enqueue('data2');
      queue.clear();

      const stats = queue.getStats();
      expect(stats.queuedCount).toBe(0);
    });
  });

  describe('getDeadLetterQueue', () => {
    it('should return dead letter queue', async () => {
      queue.setConfig({ maxRetries: 1, retryDelay: 1000, enableDeadLetter: true, maxQueueSize: 1000 });
      const handler = jest.fn(() => {
        throw new Error('Handler error');
      });

      queue.enqueue('test-data');
      await queue.dequeue(handler);
      await queue.dequeue(handler);

      const deadLetterQueue = queue.getDeadLetterQueue();

      expect(deadLetterQueue.length).toBe(1);
    });
  });
});
