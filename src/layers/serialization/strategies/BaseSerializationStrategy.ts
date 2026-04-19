/**
 * Base Serialization Strategy
 * 
 * Abstract base class providing common functionality for serialization strategies.
 */

import { ISerializationStrategy } from './ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export abstract class BaseSerializationStrategy implements ISerializationStrategy {
  protected _contentType: ContentType;
  protected _formatName: string;

  constructor(contentType: ContentType, formatName: string) {
    this._contentType = contentType;
    this._formatName = formatName;
  }

  abstract serialize(data: unknown): string;
  abstract deserialize(data: string): unknown;

  getContentType(): ContentType {
    return this._contentType;
  }

  getFormatName(): string {
    return this._formatName;
  }

  canSerialize(data: unknown): boolean {
    try {
      this.serialize(data);
      return true;
    } catch {
      return false;
    }
  }

  canDeserialize(data: string): boolean {
    try {
      this.deserialize(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely serializes data with error handling
   * 
   * @param data - Data to serialize
   * @returns Serialized string or null if failed
   */
  safeSerialize(data: unknown): string | null {
    try {
      return this.serialize(data);
    } catch {
      return null;
    }
  }

  /**
   * Safely deserializes data with error handling
   * 
   * @param data - Data to deserialize
   * @returns Deserialized data or null if failed
   */
  safeDeserialize(data: string): unknown | null {
    try {
      return this.deserialize(data);
    } catch {
      return null;
    }
  }

  /**
   * Validates if data is not null/undefined
   * 
   * @param data - Data to validate
   * @returns True if data is valid
   */
  protected _isValidData(data: unknown): boolean {
    return data !== null && data !== undefined;
  }

  /**
   * Validates if string is not empty
   * 
   * @param data - String to validate
   * @returns True if string is valid
   */
  protected _isValidString(data: string): boolean {
    return typeof data === 'string' && data.length > 0;
  }
}
