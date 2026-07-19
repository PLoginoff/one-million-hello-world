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
  register(key: string, strategy: ISerializationStrategy, metadata?: Partial<StrategyMetadata>): void {
    const fullMetadata: StrategyMetadata = {
      name: metadata?.name ?? key,
      format: metadata?.format ?? strategy.getFormatName(),
      contentType: metadata?.contentType ?? strategy.getContentType(),
      version: metadata?.version,
      description: metadata?.description,
      tags: metadata?.tags,
      priority: metadata?.priority,
    };
    this._strategies.set(key, { strategy, metadata: fullMetadata });
    this._formatMap.set(fullMetadata.format, key);
    this._contentTypeMap.set(fullMetadata.contentType, key);
  }

  /**
   * Updates strategy metadata
   *
   * @param key - Strategy key
   * @param updates - Metadata updates
   */
  updateMetadata(key: string, updates: Partial<StrategyMetadata>): void {
    const entry = this._strategies.get(key);
    if (!entry) {
      throw new Error(`Strategy not found: ${key}`);
    }
    const previousFormat = entry.metadata.format;
    const previousContentType = entry.metadata.contentType;
    const updated = { ...entry.metadata, ...updates };
    entry.metadata = updated;

    if (updated.format !== previousFormat) {
      this._formatMap.delete(previousFormat);
      this._formatMap.set(updated.format, key);
    }

    if (updated.contentType !== previousContentType) {
      this._contentTypeMap.delete(previousContentType);
      this._contentTypeMap.set(updated.contentType, key);
    }
  }

  /**
   * Lists all registered strategy keys
   *
   * @returns Array of strategy keys
   */
  list(): string[] {
    return Array.from(this._strategies.keys());
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
    return key !== undefined ? this.get(key) : undefined;
  }

  /**
   * Gets a strategy by content type
   *
   * @param contentType - Content type
   * @returns Strategy or undefined
   */
  getByContentType(contentType: ContentType): ISerializationStrategy | undefined {
    const key = this._contentTypeMap.get(contentType);
    return key !== undefined ? this.get(key) : undefined;
  }

  /**
   * Gets all registered strategies
   *
   * @returns Array of strategies with metadata
   */
  getAll(): Map<string, ISerializationStrategy> {
    return new Map(Array.from(this._strategies.entries()).map(([key, entry]) => [key, entry.strategy]));
  }

  /**
   * Gets all registered strategies with metadata
   *
   * @returns Array of strategies with metadata
   */
  getAllWithMetadata(): Array<{ key: string; strategy: ISerializationStrategy; metadata: StrategyMetadata }> {
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
    return this.getAllWithMetadata().filter((entry) => entry.metadata.tags?.includes(tag));
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
    return Array.from(this._contentTypeMap.keys()) as ContentType[];
  }

  /**
   * Gets strategies by priority (highest first)
   *
   * @returns Array of strategies sorted by priority
   */
  getByPriority(): Array<{ key: string; strategy: ISerializationStrategy; metadata: StrategyMetadata }> {
    return this.getAllWithMetadata().sort((a, b) => {
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
