/**
 * String Serialization Strategy
 * 
 * Implements string serialization and deserialization.
 */

import { ISerializationStrategy } from './ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export class StringStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    return String(data);
  }

  deserialize(data: string): unknown {
    return data;
  }

  getContentType(): ContentType {
    return ContentType.PLAIN_TEXT;
  }

  getFormatName(): string {
    return 'string';
  }

  canSerialize(data: unknown): boolean {
    return data !== undefined && data !== null;
  }

  canDeserialize(data: string): boolean {
    return typeof data === 'string';
  }
}
