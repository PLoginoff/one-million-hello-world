/**
 * Serializer Interface
 * 
 * Defines the contract for serialization operations
 * including response serialization, versioning, and content negotiation.
 */

import {
  ContentType,
  SerializationFormat,
  SerializationResult,
  SerializationConfig,
} from '../types/serialization-types';

/**
 * Interface for serialization operations
 */
export interface ISerializer {
  /**
   * Serializes data to specified format
   * 
   * @param data - Data to serialize
   * @param format - Serialization format
   * @returns Serialization result
   */
  serialize<T>(data: T, format?: SerializationFormat): SerializationResult;

  /**
   * Deserializes data from specified format
   * 
   * @param data - Data to deserialize
   * @param format - Serialization format
   * @returns Deserialization result
   */
  deserialize<T>(data: string, format: SerializationFormat): SerializationResult & { data?: T };

  /**
   * Negotiates content type based on accept header
   * 
   * @param acceptHeader - Accept header value
   * @returns Negotiated content type
   */
  negotiateContentType(acceptHeader: string): ContentType;

  /**
   * Sets serialization configuration
   * 
   * @param config - Serialization configuration
   */
  setConfig(config: SerializationConfig): void;

  /**
   * Gets current serialization configuration
   * 
   * @returns Current serialization configuration
   */
  getConfig(): SerializationConfig;
}
