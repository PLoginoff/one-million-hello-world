/**
 * ConsoleEventPublisher - Infrastructure Implementation
 *
 * Console-based event publisher for debugging and logging.
 * Outputs events to console for development purposes.
 */

import { IEventPublisher, PublishResult } from '../interfaces';
import { Event } from '../../domain/entities/Event';

export class ConsoleEventPublisher implements IEventPublisher {
  private _connected: boolean;
  private _prefix: string;

  constructor(prefix: string = '[EventPublisher]') {
    this._connected = true;
    this._prefix = prefix;
  }

  publish(event: Event): Promise<PublishResult> {
    if (!this._connected) {
      return Promise.resolve({
        success: false,
        eventId: event.id.value,
        publishedAt: new Date(),
        error: new Error('Publisher is not connected'),
      });
    }

    console.warn(this._prefix, {
      id: event.id.value,
      type: event.type.value,
      payload: event.payload.data,
      metadata: event.metadata.toJSON(),
      occurredAt: event.occurredAt.toISOString(),
    });

    return Promise.resolve({
      success: true,
      eventId: event.id.value,
      publishedAt: new Date(),
    });
  }

  async publishBatch(events: Event[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];

    for (const event of events) {
      const result = await this.publish(event);
      results.push(result);
    }

    return results;
  }

  isConnected(): boolean {
    return this._connected;
  }

  connect(): Promise<void> {
    this._connected = true;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this._connected = false;
    return Promise.resolve();
  }
}
