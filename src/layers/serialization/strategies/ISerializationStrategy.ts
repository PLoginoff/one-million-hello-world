/**
 * Serialization Strategy Interface
 * 
 * Defines the contract for serialization format strategies.
 * Each strategy handles a specific serialization format.
 */

import { ContentType } from '../types/serialization-types';

export interface ISerializationStrategy {
  /**
   * Serializes data to string format
   * 
   * @param data - Data to serialize
   * @returns Serialized string
   * @throws Error if serialization fails
   */
  serialize(data: unknown): string;

  /**
   * Deserializes string to data
   * 
   * @param data - String to deserialize
   * @returns Deserialized data
   * @throws Error if deserialization fails
   */
  deserialize(data: string): unknown;

  /**
   * Gets the content type for this strategy
   * 
   * @returns Content type
   */
  getContentType(): ContentType;

  /**
   * Gets the format name for this strategy
   * 
   * @returns Format name
   */
  getFormatName(): string;

  /**
   * Validates if data can be serialized by this strategy
   * 
   * @param data - Data to validate
   * @returns True if data is valid for serialization
   */
  canSerialize(data: unknown): boolean;

  /**
   * Validates if string can be deserialized by this strategy
   * 
   * @param data - String to validate
   * @returns True if string is valid for deserialization
   */
  canDeserialize(data: string): boolean;
}
