/**
 * Compression Result Entity
 * 
 * Represents the result of a compression operation with metadata.
 * Immutable entity that stores compressed data with performance metrics.
 */

import { CompressionMetadata } from '../value-objects/CompressionMetadata';

export class CompressionResultEntity {
  readonly data: Uint8Array;
  readonly originalSize: number;
  readonly compressedSize: number;
  readonly metadata: CompressionMetadata;
  readonly algorithm: string;
  readonly compressionRatio: number;

  constructor(
    data: Uint8Array,
    originalSize: number,
    compressedSize: number,
    algorithm: string,
    metadata?: CompressionMetadata,
  ) {
    this.data = data;
    this.originalSize = originalSize;
    this.compressedSize = compressedSize;
    this.algorithm = algorithm;
    this.metadata = metadata || this._createDefaultMetadata();
    this.compressionRatio = this._calculateCompressionRatio();
  }

  /**
   * Get compression ratio (0-1)
   */
  getCompressionRatio(): number {
    return this.compressionRatio;
  }

  /**
   * Get space saved in bytes
   */
  getSpaceSaved(): number {
    return this.originalSize - this.compressedSize;
  }

  /**
   * Get space saved percentage
   */
  getSpaceSavedPercentage(): number {
    return (1 - this.compressionRatio) * 100;
  }

  /**
   * Check if compression was effective (ratio < 1)
   */
  isEffective(): boolean {
    return this.compressionRatio < 1;
  }

  /**
   * Check if compression was significant (ratio < 0.5)
   */
  isSignificant(): boolean {
    return this.compressionRatio < 0.5;
  }

  /**
   * Get compression time in milliseconds
   */
  getCompressionTime(): number {
    return this.metadata.compressionTime;
  }

  /**
   * Get decompression time in milliseconds
   */
  getDecompressionTime(): number {
    return this.metadata.decompressionTime || 0;
  }

  /**
   * Create a copy of this entity
   */
  clone(): CompressionResultEntity {
    return new CompressionResultEntity(
      new Uint8Array(this.data),
      this.originalSize,
      this.compressedSize,
      this.algorithm,
      this.metadata.clone(),
    );
  }

  /**
   * Update metadata
   */
  updateMetadata(updates: Partial<CompressionMetadata>): CompressionResultEntity {
    return new CompressionResultEntity(
      this.data,
      this.originalSize,
      this.compressedSize,
      this.algorithm,
      this.metadata.update(updates),
    );
  }

  private _calculateCompressionRatio(): number {
    if (this.originalSize === 0) return 1;
    return this.compressedSize / this.originalSize;
  }

  private _createDefaultMetadata(): CompressionMetadata {
    return new CompressionMetadata({
      compressionTime: 0,
      timestamp: Date.now(),
      quality: 1,
    });
  }
}
