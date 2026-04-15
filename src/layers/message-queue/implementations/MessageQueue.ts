/**
 * Message Queue Implementation
 * 
 * Concrete implementation of IMessageQueue.
 * Handles async processing and dead letter queues.
 */

import { IMessageQueue, MessageHandler } from '../interfaces/IMessageQueue';
import {
  Message,
  QueueStats,
  QueueConfig,
  QueueResult,
} from '../types/message-queue-types';

export class MessageQueue implements IMessageQueue {
  private _queue: Message[];
  private _deadLetterQueue: Message[];
  private _config: QueueConfig;
  private _stats: QueueStats;
  private _handler: MessageHandler | null;
  private _isRunning: boolean;
  private _processing: boolean;

  constructor() {
    this._queue = [];
    this._deadLetterQueue = [];
    this._config = {
      maxRetries: 3,
      retryDelay: 1000,
      enableDeadLetter: true,
      maxQueueSize: 1000,
    };
    this._stats = {
      queuedCount: 0,
      processedCount: 0,
      failedCount: 0,
      deadLetterCount: 0,
    };
    this._handler = null;
    this._isRunning = false;
    this._processing = false;
  }

  enqueue<T>(data: T, priority: number = 0): QueueResult {
    if (this._queue.length >= this._config.maxQueueSize) {
      return {
        success: false,
        error: 'Queue is full',
      };
    }

    const message: Message<T> = {
      id: this._generateId(),
      data,
      priority,
      attempts: 0,
      maxAttempts: this._config.maxRetries,
      createdAt: Date.now(),
      scheduledAt: Date.now(),
    };

    this._queue.push(message as Message);
    this._queue.sort((a, b) => b.priority - a.priority);
    this._stats.queuedCount++;

    return {
      success: true,
      messageId: message.id,
    };
  }

  async dequeue<T>(handler: MessageHandler<T>): Promise<void> {
    if (this._queue.length === 0) {
      return;
    }

    const message = this._queue.shift() as Message<T>;
    if (!message) return;

    try {
      await handler(message.data);
      this._stats.processedCount++;
    } catch (error) {
      message.attempts++;

      if (message.attempts >= message.maxAttempts) {
        if (this._config.enableDeadLetter) {
          this._deadLetterQueue.push(message);
          this._stats.deadLetterCount++;
        }
        this._stats.failedCount++;
      } else {
        message.scheduledAt = Date.now() + this._config.retryDelay;
        this._queue.push(message);
        this._queue.sort((a, b) => b.priority - a.priority);
      }
    }

    this._stats.queuedCount = this._queue.length;
  }

  registerHandler<T>(handler: MessageHandler<T>): void {
    this._handler = handler;
  }

  start(): void {
    if (this._isRunning || !this._handler) {
      return;
    }

    this._isRunning = true;
    this._processQueue();
  }

  stop(): void {
    this._isRunning = false;
  }

  getStats(): QueueStats {
    return { ...this._stats };
  }

  setConfig(config: QueueConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): QueueConfig {
    return { ...this._config };
  }

  clear(): void {
    this._queue = [];
    this._stats.queuedCount = 0;
  }

  getDeadLetterQueue<T>(): Message<T>[] {
    return this._deadLetterQueue as Message<T>[];
  }

  private async _processQueue(): Promise<void> {
    while (this._isRunning && this._handler) {
      if (this._processing) {
        await this._delay(100);
        continue;
      }

      if (this._queue.length === 0) {
        await this._delay(100);
        continue;
      }

      const now = Date.now();
      const message = this._queue[0];

      if (message && message.scheduledAt > now) {
        await this._delay(100);
        continue;
      }

      this._processing = true;
      await this.dequeue(this._handler as any);
      this._processing = false;
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();
      const end = start + ms;
      const loop = () => {
        if (Date.now() >= end) {
          resolve();
        } else {
          Promise.resolve().then(loop);
        }
      };
      loop();
    });
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
