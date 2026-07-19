/**
 * MemoryEventQueue - Infrastructure Implementation
 *
 * In-memory event queue implementation.
 * Provides buffered event processing with queue semantics.
 */

import { IEventQueue, QueueStats } from '../interfaces';
import { Event } from '../../domain/entities/Event';

export class MemoryEventQueue implements IEventQueue {
  private _queue: Event[];
  private _processing: boolean;
  private _processor?: (event: Event) => Promise<void>;
  private _stats: QueueStats;
  private _processingTimes: number[];

  constructor() {
    this._queue = [];
    this._processing = false;
    this._stats = {
      size: 0,
      processed: 0,
      failed: 0,
      avgProcessingTime: 0,
    };
    this._processingTimes = [];
  }

  setProcessor(processor: (event: Event) => Promise<void>): void {
    this._processor = processor;
  }

  enqueue(event: Event): Promise<void> {
    this._queue.push(event);
    this._stats.size = this._queue.length;
    return Promise.resolve();
  }

  async enqueueBatch(events: Event[]): Promise<void> {
    for (const event of events) {
      await this.enqueue(event);
    }
  }

  dequeue(): Promise<Event | undefined> {
    return Promise.resolve(this._queue.shift());
  }

  peek(): Promise<Event | undefined> {
    return Promise.resolve(this._queue[0]);
  }

  size(): Promise<number> {
    return Promise.resolve(this._queue.length);
  }

  isEmpty(): Promise<boolean> {
    return Promise.resolve(this._queue.length === 0);
  }

  clear(): Promise<void> {
    this._queue = [];
    this._stats.size = 0;
    return Promise.resolve();
  }

  getStats(): QueueStats {
    return { ...this._stats };
  }

  startProcessing(): Promise<void> {
    if (this._processing) {
      return Promise.resolve();
    }

    this._processing = true;
    this._processQueue().catch(() => {
      // Background processing errors are recorded in stats
    });
    return Promise.resolve();
  }

  stopProcessing(): Promise<void> {
    this._processing = false;
    return Promise.resolve();
  }

  isProcessing(): boolean {
    return this._processing;
  }

  private async _processQueue(): Promise<void> {
    while (this._processing && this._queue.length > 0) {
      const event = this._queue.shift();
      this._stats.size = this._queue.length;

      if (event && this._processor) {
        const startTime = performance.now();

        try {
          await this._processor(event);
          this._stats.processed++;
          this._recordProcessingTime(performance.now() - startTime);
        } catch (error) {
          this._stats.failed++;
        }
      }
    }

    if (this._queue.length === 0) {
      this._processing = false;
    }
  }

  private _recordProcessingTime(time: number): void {
    this._processingTimes.push(time);

    if (this._processingTimes.length > 100) {
      this._processingTimes.shift();
    }

    const sum = this._processingTimes.reduce((a, b) => a + b, 0);
    this._stats.avgProcessingTime = sum / this._processingTimes.length;
  }
}
