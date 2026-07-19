/**
 * In-Memory Message Queue Adapter
 *
 * Stores messages in memory with priority queue support.
 */

import { IMessageQueue } from '../interfaces/IMessageQueue';
import { Message, QueueStats, QueueConfig, QueueResult } from '../types/message-queue-types';
import { MessageHandler } from '../interfaces/IMessageQueue';

export class InMemoryQueueAdapter implements IMessageQueue {
  private _queue: Message<unknown>[];
  private _deadLetter: Message<unknown>[];
  private _handler: MessageHandler<unknown> | null;
  private _processing: boolean;
  private _config: QueueConfig;
  private _stats: QueueStats;

  constructor() {
    this._queue = [];
    this._deadLetter = [];
    this._handler = null;
    this._processing = false;
    this._config = { maxRetries: 3, retryDelay: 1000, enableDeadLetter: true, maxQueueSize: 10000 };
    this._stats = { queuedCount: 0, processedCount: 0, failedCount: 0, deadLetterCount: 0 };
  }

  enqueue<T>(data: T, priority: number = 0): QueueResult {
    if (this._queue.length >= this._config.maxQueueSize) {
      return { success: false, error: 'Queue is full' };
    }

    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message: Message<T> = {
      id,
      data,
      priority,
      attempts: 0,
      maxAttempts: this._config.maxRetries,
      createdAt: Date.now(),
      scheduledAt: Date.now(),
    };

    this._queue.push(message as Message<unknown>);
    this._queue.sort((a, b) => b.priority - a.priority);
    this._stats.queuedCount++;

    return { success: true, messageId: id };
  }

  async dequeue<T>(handler: MessageHandler<T>): Promise<void> {
    const message = this._queue.shift();
    if (!message) return;

    message.attempts++;
    try {
      await handler(message.data as T);
      this._stats.processedCount++;
    } catch (err) {
      this._stats.failedCount++;
      if (message.attempts < message.maxAttempts) {
        this._queue.push(message);
      } else if (this._config.enableDeadLetter) {
        this._deadLetter.push(message);
        this._stats.deadLetterCount++;
      }
    }
  }

  registerHandler<T>(handler: MessageHandler<T>): void {
    this._handler = handler as MessageHandler<unknown>;
  }

  start(): void {
    this._processing = true;
    void this._processLoop();
  }

  stop(): void {
    this._processing = false;
  }

  private async _processLoop(): Promise<void> {
    while (this._processing && this._queue.length > 0 && this._handler) {
      await this.dequeue(this._handler);
    }
  }

  getStats(): QueueStats {
    return { ...this._stats };
  }

  setConfig(config: QueueConfig): void {
    this._config = { ...config };
  }

  getConfig(): QueueConfig {
    return { ...this._config };
  }

  clear(): void {
    this._queue = [];
    this._stats.queuedCount = 0;
  }

  getDeadLetterQueue<T>(): Message<T>[] {
    return this._deadLetter as Message<T>[];
  }
}
