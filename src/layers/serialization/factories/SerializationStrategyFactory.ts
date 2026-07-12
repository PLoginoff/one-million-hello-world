/**
 * Serialization Strategy Factory
 *
 * Factory for creating serialization strategies.
 */

import { ISerializationStrategyFactory } from './ISerializationStrategyFactory';
import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { SerializationFormat } from '../types/serialization-types';
import { JSONStrategy } from '../strategies/JSONStrategy';
import { XMLStrategy } from '../strategies/XMLStrategy';
import { StringStrategy } from '../strategies/StringStrategy';

export class SerializationStrategyFactory implements ISerializationStrategyFactory {
  private _strategies: Map<SerializationFormat, () => ISerializationStrategy>;

  constructor() {
    this._strategies = new Map();
    this._registerDefaultStrategies();
  }

  createStrategy(format: SerializationFormat | string): ISerializationStrategy {
    const factory = this._strategies.get(format as SerializationFormat);
    if (!factory) {
      throw new Error(`Unsupported serialization format: ${format}`);
    }
    return factory();
  }

  registerStrategy(format: SerializationFormat | string, strategy: () => ISerializationStrategy): void {
    this._strategies.set(format as SerializationFormat, strategy);
  }

  isSupported(format: SerializationFormat | string): boolean {
    return this._strategies.has(format as SerializationFormat);
  }

  getSupportedFormats(): SerializationFormat[] {
    return Array.from(this._strategies.keys());
  }

  /**
   * Checks if a strategy is registered for the format
   *
   * @param format - Serialization format
   * @returns True if registered
   */
  hasStrategy(format: SerializationFormat | string): boolean {
    return this._strategies.has(format as SerializationFormat);
  }

  /**
   * Gets all available strategy formats
   *
   * @returns Array of available formats
   */
  getAvailableStrategies(): SerializationFormat[] {
    return this.getSupportedFormats();
  }

  /**
   * Unregisters a strategy for a format
   *
   * @param format - Serialization format
   */
  unregisterStrategy(format: SerializationFormat | string): void {
    this._strategies.delete(format as SerializationFormat);
  }

  /**
   * Clears all registered strategies
   */
  clearStrategies(): void {
    this._strategies.clear();
  }

  private _registerDefaultStrategies(): void {
    this._strategies.set(SerializationFormat.JSON, () => new JSONStrategy());
    this._strategies.set(SerializationFormat.XML, () => new XMLStrategy());
    this._strategies.set(SerializationFormat.STRING, () => new StringStrategy());
  }
}
