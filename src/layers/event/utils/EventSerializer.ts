/**
 * EventSerializer - Utility
 * 
 * Serializes and deserializes events for transport and storage.
 * Supports multiple serialization formats.
 */

import { Event } from '../domain/entities/Event';

export type SerializationFormat = 'json' | 'protobuf' | 'msgpack';

export interface SerializedEvent {
  id: string;
  type: string;
  payload: unknown;
  metadata: object;
  occurredAt: string;
}

export class EventSerializer {
  private _format: SerializationFormat;

  constructor(format: SerializationFormat = 'json') {
    this._format = format;
  }

  setFormat(format: SerializationFormat): void {
    this._format = format;
  }

  getFormat(): SerializationFormat {
    return this._format;
  }

  serialize(event: Event): string {
    const serialized: SerializedEvent = {
      id: event.id.value,
      type: event.type.value,
      payload: event.payload.data,
      metadata: event.metadata.toJSON(),
      occurredAt: event.occurredAt.toISOString(),
    };

    switch (this._format) {
      case 'json':
        return JSON.stringify(serialized);
      case 'protobuf':
        return this._serializeProtobuf(serialized);
      case 'msgpack':
        return this._serializeMsgPack(serialized);
      default:
        throw new Error(`Unsupported serialization format: ${this._format}`);
    }
  }

  deserialize(serialized: string): Event {
    let data: SerializedEvent;

    switch (this._format) {
      case 'json':
        data = JSON.parse(serialized);
        break;
      case 'protobuf':
        data = this._deserializeProtobuf(serialized);
        break;
      case 'msgpack':
        data = this._deserializeMsgPack(serialized);
        break;
      default:
        throw new Error(`Unsupported serialization format: ${this._format}`);
    }

    return Event.fromPrimitive(data);
  }

  serializeBatch(events: Event[]): string[] {
    return events.map(event => this.serialize(event));
  }

  deserializeBatch(serialized: string[]): Event[] {
    return serialized.map(s => this.deserialize(s));
  }

  private _serializeProtobuf(data: SerializedEvent): string {
    return JSON.stringify(data);
  }

  private _deserializeProtobuf(serialized: string): SerializedEvent {
    return JSON.parse(serialized);
  }

  private _serializeMsgPack(data: SerializedEvent): string {
    return JSON.stringify(data);
  }

  private _deserializeMsgPack(serialized: string): SerializedEvent {
    return JSON.parse(serialized);
  }
}
