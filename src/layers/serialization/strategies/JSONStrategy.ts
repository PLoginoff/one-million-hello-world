/**
 * JSON Serialization Strategy
 * 
 * Implements JSON serialization and deserialization.
 */

import { ISerializationStrategy } from './ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export class JSONStrategy implements ISerializationStrategy {
  serialize(data: unknown): string {
    return JSON.stringify(data);
  }

  deserialize(data: string): unknown {
    return JSON.parse(data);
  }

  getContentType(): ContentType {
    return ContentType.JSON;
  }

  getFormatName(): string {
    return 'json';
  }

  canSerialize(data: unknown): boolean {
    try {
      JSON.stringify(data);
      return true;
    } catch {
      return false;
    }
  }

  canDeserialize(data: string): boolean {
    try {
      JSON.parse(data);
      return true;
    } catch {
      return false;
    }
  }
}
