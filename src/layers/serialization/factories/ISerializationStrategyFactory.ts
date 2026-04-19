/**
 * Serialization Strategy Factory Interface
 * 
 * Defines the contract for creating serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { SerializationFormat } from '../types/serialization-types';

export interface ISerializationStrategyFactory {
  /**
   * Creates a strategy for the given format
   * 
   * @param format - Serialization format
   * @returns Strategy instance
   * @throws Error if format is not supported
   */
  createStrategy(format: SerializationFormat): ISerializationStrategy;

  /**
   * Registers a strategy for a format
   * 
   * @param format - Serialization format
   * @param strategy - Strategy factory function
   */
  registerStrategy(format: SerializationFormat, strategy: () => ISerializationStrategy): void;

  /**
   * Checks if a format is supported
   * 
   * @param format - Serialization format
   * @returns True if supported
   */
  isSupported(format: SerializationFormat): boolean;

  /**
   * Gets all supported formats
   * 
   * @returns Array of supported formats
   */
  getSupportedFormats(): SerializationFormat[];
}
