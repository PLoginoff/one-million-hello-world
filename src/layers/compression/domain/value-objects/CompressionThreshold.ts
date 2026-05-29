/**
 * Compression Threshold Value Object
 * 
 * Represents compression threshold configuration.
 * Immutable value object for threshold management.
 */

export interface CompressionThresholdData {
  minSize: number;
  maxSize: number;
  minCompressionRatio: number;
  maxCompressionTime: number;
  enableDynamicCompression: boolean;
}

export class CompressionThreshold {
  readonly data: CompressionThresholdData;

  constructor(data: CompressionThresholdData) {
    this._validateThreshold(data);
    this.data = { ...data };
  }

  /**
   * Get minimum size for compression
   */
  getMinSize(): number {
    return this.data.minSize;
  }

  /**
   * Get maximum size for compression
   */
  getMaxSize(): number {
    return this.data.maxSize;
  }

  /**
   * Get minimum compression ratio
   */
  getMinCompressionRatio(): number {
    return this.data.minCompressionRatio;
  }

  /**
   * Get maximum compression time
   */
  getMaxCompressionTime(): number {
    return this.data.maxCompressionTime;
  }

  /**
   * Check if dynamic compression is enabled
   */
  isDynamicCompressionEnabled(): boolean {
    return this.data.enableDynamicCompression;
  }

  /**
   * Check if size is within threshold
   */
  isSizeWithinThreshold(size: number): boolean {
    return size >= this.data.minSize && size <= this.data.maxSize;
  }

  /**
   * Check if compression ratio meets threshold
   */
  isCompressionRatioAcceptable(ratio: number): boolean {
    return ratio <= this.data.minCompressionRatio;
  }

  /**
   * Check if compression time is acceptable
   */
  isCompressionTimeAcceptable(time: number): boolean {
    return time <= this.data.maxCompressionTime;
  }

  /**
   * Check if compression should be attempted
   */
  shouldCompress(size: number): boolean {
    return this.isSizeWithinThreshold(size);
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<CompressionThresholdData>): CompressionThreshold {
    return new CompressionThreshold({ ...this.data, ...updates });
  }

  /**
   * Create default threshold
   */
  static createDefault(): CompressionThreshold {
    return new CompressionThreshold({
      minSize: 1024,
      maxSize: 10 * 1024 * 1024,
      minCompressionRatio: 0.8,
      maxCompressionTime: 1000,
      enableDynamicCompression: true,
    });
  }

  /**
   * Create strict threshold (higher requirements)
   */
  static createStrict(): CompressionThreshold {
    return new CompressionThreshold({
      minSize: 2048,
      maxSize: 5 * 1024 * 1024,
      minCompressionRatio: 0.7,
      maxCompressionTime: 500,
      enableDynamicCompression: true,
    });
  }

  /**
   * Create lenient threshold (lower requirements)
   */
  static createLenient(): CompressionThreshold {
    return new CompressionThreshold({
      minSize: 512,
      maxSize: 50 * 1024 * 1024,
      minCompressionRatio: 0.9,
      maxCompressionTime: 2000,
      enableDynamicCompression: false,
    });
  }

  private _validateThreshold(data: CompressionThresholdData): void {
    if (data.minSize < 0) {
      throw new Error('Min size must be non-negative');
    }

    if (data.maxSize < data.minSize) {
      throw new Error('Max size must be greater than or equal to min size');
    }

    if (data.minCompressionRatio <= 0 || data.minCompressionRatio > 1) {
      throw new Error('Min compression ratio must be between 0 and 1');
    }

    if (data.maxCompressionTime <= 0) {
      throw new Error('Max compression time must be positive');
    }
  }
}
