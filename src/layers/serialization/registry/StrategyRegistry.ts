/**
 * Strategy Registry
 * 
 * Central registry for serialization strategies with metadata.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface StrategyMetadata {
  name: string;
  format: string;
  contentType: ContentType;
  version?: string;
  description?: string;
  tags?: string[];
  priority?: number;
}

export class StrategyRegistry {
  private _strategies: Map<string, { strategy: ISerializationStrategy; metadata: StrategyMetadata }>;
  private _formatMap: Map<string, string>;
  private _contentTypeMap: Map<string, string>;

  constructor() {
    this._strategies = new Map();
    this._formatMap = new Map();
    this._contentTypeMap = new Map();
  }

  /**
   * Registers a strategy with metadata
   * 
   * @param key - Unique key for the strategy
   * @param strategy - Strategy instance
   * @param metadata - Strategy metadata
   */
  register(key: string, strategy: ISerializationStrategy, metadata: StrategyMetadata): void {
    this._strategies.set(key, { strategy, metadata });
    this._formatMap.set(metadata.format, key);
    this._contentTypeMap.set(metadata.contentType, key);
  }

  /**
   * Unregisters a strategy
   * 
   * @param key - Strategy key
   */
  unregister(key: string): void {
    const entry = this._strategies.get(key);
    if (entry) {
      this._formatMap.delete(entry.metadata.format);
      this._contentTypeMap.delete(entry.metadata.contentType);
    }
    this._strategies.delete(key);
  }

  /**
   * Gets a strategy by key
   * 
   * @param key - Strategy key
   * @returns Strategy or undefined
   */
  get(key: string): ISerializationStrategy | undefined {
    return this._strategies.get(key)?.strategy;
  }

  /**
   * Gets strategy metadata by key
   * 
   * @param key - Strategy key
   * @returns Metadata or undefined
   */
  getMetadata(key: string): StrategyMetadata | undefined {
    return this._strategies.get(key)?.metadata;
  }

  /**
   * Gets a strategy by format
   * 
   * @param format - Format name
   * @returns Strategy or undefined
   */
  getByFormat(format: string): ISerializationStrategy | undefined {
    const key = this._formatMap.get(format);
    return key ? this.get(key) : undefined;
  }

  /**
   * Gets a strategy by content type
   * 
   * @param contentType - Content type
   * @returns Strategy or undefined
   */
  getByContentType(contentType: ContentType): ISerializationStrategy | undefined {
    const key = this._contentTypeMap.get(contentType);
    return key ? this.get(key) : undefined;
  }

  /**
   * Gets all registered strategies
   * 
   * @returns Array of strategies with metadata
   */
  getAll(): Array<{ key: string; strategy: ISerializationStrategy; metadata: StrategyMetadata }> {
    return Array.from(this._strategies.entries()).map(([key, entry]) => ({
      key,
      strategy: entry.strategy,
      metadata: entry.metadata,
    }));
  }

  /**
   * Gets strategies by tag
   * 
   * @param tag - Tag to filter by
   * @returns Array of matching strategies
   */
  getByTag(tag: string): Array<{ key: string; strategy: ISerializationStrategy; metadata: StrategyMetadata }> {
    return this.getAll().filter(entry => entry.metadata.tags?.includes(tag));
  }

  /**
   * Checks if a strategy is registered
   * 
   * @param key - Strategy key
   * @returns True if registered
   */
  has(key: string): boolean {
    return this._strategies.has(key);
  }

  /**
   * Checks if a format is supported
   * 
   * @param format - Format name
   * @returns True if supported
   */
  supportsFormat(format: string): boolean {
    return this._formatMap.has(format);
  }

  /**
   * Checks if a content type is supported
   * 
   * @param contentType - Content type
   * @returns True if supported
   */
  supportsContentType(contentType: ContentType): boolean {
    return this._contentTypeMap.has(contentType);
  }

  /**
   * Gets all supported formats
   * 
   * @returns Array of format names
   */
  getSupportedFormats(): string[] {
    return Array.from(this._formatMap.keys());
  }

  /**
   * Gets all supported content types
   * 
   * @returns Array of content types
   */
  getSupportedContentTypes(): ContentType[] {
    return Array.from(this._contentTypeMap.keys());
  }

  /**
   * Gets strategies by priority (highest first)
   * 
   * @returns Array of strategies sorted by priority
   */
  getByPriority(): Array<{ key: string; strategy: ISerializationStrategy; metadata: StrategyMetadata }> {
    return this.getAll().sort((a, b) => {
      const aPriority = a.metadata.priority ?? 0;
      const bPriority = b.metadata.priority ?? 0;
      return bPriority - aPriority;
    });
  }

  /**
   * Clears all registered strategies
   */
  clear(): void {
    this._strategies.clear();
    this._formatMap.clear();
    this._contentTypeMap.clear();
  }

  /**
   * Gets the number of registered strategies
   * 
   * @returns Number of strategies
   */
  size(): number {
    return this._strategies.size;
  }
}
