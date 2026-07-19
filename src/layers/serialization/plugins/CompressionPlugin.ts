/**
 * Compression Plugin
 *
 * Example plugin that compresses/decompresses serialized data.
 */

import { ISerializationPlugin } from './ISerializationPlugin';

export class CompressionPlugin implements ISerializationPlugin {
  readonly name = 'compression';
  readonly version = '1.0.0';
  private readonly _enabled: boolean;

  constructor(enabled: boolean = true) {
    this._enabled = enabled;
  }

  initialize(): Promise<void> {
    console.warn(`[CompressionPlugin] Initialized`);
    return Promise.resolve();
  }

  cleanup(): Promise<void> {
    console.warn(`[CompressionPlugin] Cleaned up`);
    return Promise.resolve();
  }

  afterSerialize(serialized: string): string {
    if (!this._enabled) {
      return serialized;
    }

    try {
      const compressed = btoa(serialized);
      console.warn(`[CompressionPlugin] Compressed: ${serialized.length} -> ${compressed.length} chars`);
      return compressed;
    } catch {
      return serialized;
    }
  }

  beforeDeserialize(data: string): string {
    if (!this._enabled) {
      return data;
    }

    try {
      const decompressed = atob(data);
      console.warn(`[CompressionPlugin] Decompressed: ${data.length} -> ${decompressed.length} chars`);
      return decompressed;
    } catch {
      return data;
    }
  }
}
