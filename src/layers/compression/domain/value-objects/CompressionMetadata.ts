/**
 * Compression Metadata Value Object
 * 
 * Represents metadata for compression operations.
 * Immutable value object for tracking compression performance.
 */

export interface CompressionMetadataData {
  compressionTime: number;
  decompressionTime?: number;
  timestamp: number;
  quality: number;
  level?: number;
  strategy?: string;
}

export class CompressionMetadata {
  readonly data: CompressionMetadataData;

  constructor(data: CompressionMetadataData) {
    this.data = { ...data };
  }

  /**
   * Get compression time
   */
  getCompressionTime(): number {
    return this.data.compressionTime;
  }

  /**
   * Get decompression time
   */
  getDecompressionTime(): number {
    return this.data.decompressionTime || 0;
  }

  /**
   * Get timestamp
   */
  getTimestamp(): number {
    return this.data.timestamp;
  }

  /**
   * Get quality (0-1)
   */
  getQuality(): number {
    return this.data.quality;
  }

  /**
   * Get compression level
   */
  getLevel(): number {
    return this.data.level || 0;
  }

  /**
   * Get strategy
   */
  getStrategy(): string {
    return this.data.strategy || 'default';
  }

  /**
   * Get total processing time
   */
  getTotalTime(): number {
    return this.data.compressionTime + (this.data.decompressionTime || 0);
  }

  /**
   * Create a copy with updated values
   */
  update(updates: Partial<CompressionMetadataData>): CompressionMetadata {
    return new CompressionMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): CompressionMetadata {
    return new CompressionMetadata({ ...this.data });
  }

  /**
   * Check if compression was fast (< 100ms)
   */
  isFast(): boolean {
    return this.data.compressionTime < 100;
  }

  /**
   * Check if compression was slow (> 1000ms)
   */
  isSlow(): boolean {
    return this.data.compressionTime > 1000;
  }
}
