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

  async enqueue(event: Event): Promise<void> {
    this._queue.push(event);
    this._stats.size = this._queue.length;
  }

  async enqueueBatch(events: Event[]): Promise<void> {
    for (const event of events) {
      await this.enqueue(event);
    }
  }

  async dequeue(): Promise<Event | undefined> {
    return this._queue.shift();
  }

  async peek(): Promise<Event | undefined> {
    return this._queue[0];
  }

  async size(): Promise<number> {
    return this._queue.length;
  }

  async isEmpty(): Promise<boolean> {
    return this._queue.length === 0;
  }

  async clear(): Promise<void> {
    this._queue = [];
    this._stats.size = 0;
  }

  getStats(): QueueStats {
    return { ...this._stats };
  }

  async startProcessing(): Promise<void> {
    if (this._processing) {
      return;
    }

    this._processing = true;
    await this._processQueue();
  }

  async stopProcessing(): Promise<void> {
    this._processing = false;
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
