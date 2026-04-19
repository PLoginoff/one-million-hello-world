/**
 * Compression Decorator
 * 
 * Decorator that adds compression functionality to serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface ICompressionProvider {
  compress(data: string): string;
  decompress(data: string): string;
}

export class Base64CompressionProvider implements ICompressionProvider {
  compress(data: string): string {
    return Buffer.from(data).toString('base64');
  }

  decompress(data: string): string {
    return Buffer.from(data, 'base64').toString();
  }
}

export class CompressionDecorator implements ISerializationStrategy {
  private _strategy: ISerializationStrategy;
  private _compression: ICompressionProvider;
  private _enabled: boolean;

  constructor(
    strategy: ISerializationStrategy,
    compression?: ICompressionProvider
  ) {
    this._strategy = strategy;
    this._compression = compression ?? new Base64CompressionProvider();
    this._enabled = true;
  }

  serialize(data: unknown): string {
    const serialized = this._strategy.serialize(data);
    
    if (!this._enabled) {
      return serialized;
    }

    return this._compression.compress(serialized);
  }

  deserialize(data: string): unknown {
    let decompressedData = data;
    
    if (this._enabled) {
      decompressedData = this._compression.decompress(data);
    }

    return this._strategy.deserialize(decompressedData);
  }

  getContentType(): ContentType {
    return this._strategy.getContentType();
  }

  getFormatName(): string {
    return this._strategy.getFormatName();
  }

  canSerialize(data: unknown): boolean {
    return this._strategy.canSerialize(data);
  }

  canDeserialize(data: string): boolean {
    try {
      if (this._enabled) {
        const decompressed = this._compression.decompress(data);
        return this._strategy.canDeserialize(decompressed);
      }
      return this._strategy.canDeserialize(data);
    } catch {
      return false;
    }
  }

  /**
   * Enables or disables compression
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if compression is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets the underlying strategy
   * 
   * @returns Wrapped strategy
   */
  getStrategy(): ISerializationStrategy {
    return this._strategy;
  }

  /**
   * Gets the compression provider
   * 
   * @returns Compression provider
   */
  getCompression(): ICompressionProvider {
    return this._compression;
  }
}
