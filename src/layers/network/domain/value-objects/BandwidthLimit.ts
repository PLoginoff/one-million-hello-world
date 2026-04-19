/**
 * Bandwidth Limit Value Object
 * 
 * Represents bandwidth throttling limits for connections.
 */

export class BandwidthLimit {
  readonly maxBytesPerSecond: number;
  readonly bucketSize: number;
  readonly refillRate: number;
  readonly enabled: boolean;

  private constructor(
    maxBytesPerSecond: number,
    bucketSize: number,
    refillRate: number,
    enabled: boolean,
  ) {
    if (maxBytesPerSecond < 0) {
      throw new Error('Max bytes per second cannot be negative');
    }
    if (bucketSize < 0) {
      throw new Error('Bucket size cannot be negative');
    }
    if (refillRate < 0) {
      throw new Error('Refill rate cannot be negative');
    }
    this.maxBytesPerSecond = maxBytesPerSecond;
    this.bucketSize = bucketSize;
    this.refillRate = refillRate;
    this.enabled = enabled;
  }

  /**
   * Create unlimited bandwidth (no limit)
   */
  static unlimited(): BandwidthLimit {
    return new BandwidthLimit(0, 0, 0, false);
  }

  /**
   * Create bandwidth limit with max bytes per second
   */
  static create(maxBytesPerSecond: number): BandwidthLimit {
    return new BandwidthLimit(
      maxBytesPerSecond,
      maxBytesPerSecond,
      maxBytesPerSecond,
      true,
    );
  }

  /**
   * Create bandwidth limit with custom bucket and refill rate
   */
  static withBucket(
    maxBytesPerSecond: number,
    bucketSize: number,
    refillRate: number,
  ): BandwidthLimit {
    return new BandwidthLimit(maxBytesPerSecond, bucketSize, refillRate, true);
  }

  /**
   * Create from bytes per MB
   */
  static fromMegabytesPerSecond(mbps: number): BandwidthLimit {
    const bytesPerSecond = mbps * 1024 * 1024;
    return BandwidthLimit.create(bytesPerSecond);
  }

  /**
   * Create from kilobytes per second
   */
  static fromKilobytesPerSecond(kbps: number): BandwidthLimit {
    const bytesPerSecond = kbps * 1024;
    return BandwidthLimit.create(bytesPerSecond);
  }

  /**
   * Check if is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if is unlimited
   */
  isUnlimited(): boolean {
    return !this.enabled || this.maxBytesPerSecond === 0;
  }

  /**
   * Calculate available bytes based on time elapsed
   */
  calculateAvailableBytes(elapsedMs: number): number {
    if (!this.enabled) return Infinity;
    const refillAmount = (elapsedMs / 1000) * this.refillRate;
    return Math.min(this.bucketSize, refillAmount);
  }

  /**
   * Check if bytes are within limit
   */
  isWithinLimit(bytes: number): boolean {
    if (!this.enabled) return true;
    return bytes <= this.maxBytesPerSecond;
  }

  /**
   * Get max bytes per second
   */
  getMaxBytesPerSecond(): number {
    return this.maxBytesPerSecond;
  }

  /**
   * Get bucket size
   */
  getBucketSize(): number {
    return this.bucketSize;
  }

  /**
   * Get refill rate
   */
  getRefillRate(): number {
    return this.refillRate;
  }

  /**
   * Get max in megabytes per second
   */
  getMegabytesPerSecond(): number {
    return this.maxBytesPerSecond / (1024 * 1024);
  }

  /**
   * Get max in kilobytes per second
   */
  getKilobytesPerSecond(): number {
    return this.maxBytesPerSecond / 1024;
  }

  /**
   * Check if equals another limit
   */
  equals(other: BandwidthLimit): boolean {
    return this.maxBytesPerSecond === other.maxBytesPerSecond &&
           this.bucketSize === other.bucketSize &&
           this.refillRate === other.refillRate &&
           this.enabled === other.enabled;
  }

  /**
   * Get string representation
   */
  toString(): string {
    if (!this.enabled) return 'unlimited';
    return `${this.maxBytesPerSecond} bytes/s`;
  }
}
