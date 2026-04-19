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

  async initialize(): Promise<void> {
    console.log(`[CompressionPlugin] Initialized`);
  }

  async cleanup(): Promise<void> {
    console.log(`[CompressionPlugin] Cleaned up`);
  }

  afterSerialize(serialized: string): string {
    if (!this._enabled) {
      return serialized;
    }
    
    try {
      const compressed = btoa(serialized);
      console.log(`[CompressionPlugin] Compressed: ${serialized.length} -> ${compressed.length} chars`);
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
      console.log(`[CompressionPlugin] Decompressed: ${data.length} -> ${decompressed.length} chars`);
      return decompressed;
    } catch {
      return data;
    }
  }
}
