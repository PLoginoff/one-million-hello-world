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

  createStrategy(format: SerializationFormat): ISerializationStrategy {
    const factory = this._strategies.get(format);
    if (!factory) {
      throw new Error(`Unsupported serialization format: ${format}`);
    }
    return factory();
  }

  registerStrategy(format: SerializationFormat, strategy: () => ISerializationStrategy): void {
    this._strategies.set(format, strategy);
  }

  isSupported(format: SerializationFormat): boolean {
    return this._strategies.has(format);
  }

  getSupportedFormats(): SerializationFormat[] {
    return Array.from(this._strategies.keys());
  }

  /**
   * Unregisters a strategy for a format
   * 
   * @param format - Serialization format
   */
  unregisterStrategy(format: SerializationFormat): void {
    this._strategies.delete(format);
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
