/**
 * Cache Statistics Value Object
 * 
 * Represents cache performance metrics.
 * Immutable value object with calculation methods.
 */

export class CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly size: number;
  readonly createdAt: number;

  constructor(
    hits: number = 0,
    misses: number = 0,
    evictions: number = 0,
    size: number = 0,
  ) {
    this.hits = hits;
    this.misses = misses;
    this.evictions = evictions;
    this.size = size;
    this.createdAt = Date.now();
  }

  /**
   * Calculate hit rate
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return this.hits / total;
  }

  /**
   * Calculate miss rate
   */
  getMissRate(): number {
    return 1 - this.getHitRate();
  }

  /**
   * Get total requests
   */
  getTotalRequests(): number {
    return this.hits + this.misses;
  }

  /**
   * Create a copy with incremented hits
   */
  withHit(): CacheStats {
    return new CacheStats(
      this.hits + 1,
      this.misses,
      this.evictions,
      this.size,
    );
  }

  /**
   * Create a copy with incremented misses
   */
  withMiss(): CacheStats {
    return new CacheStats(
      this.hits,
      this.misses + 1,
      this.evictions,
      this.size,
    );
  }

  /**
   * Create a copy with incremented evictions
   */
  withEviction(): CacheStats {
    return new CacheStats(
      this.hits,
      this.misses,
      this.evictions + 1,
      this.size,
    );
  }

  /**
   * Create a copy with new size
   */
  withSize(size: number): CacheStats {
    return new CacheStats(
      this.hits,
      this.misses,
      this.evictions,
      size,
    );
  }

  /**
   * Reset all statistics
   */
  reset(): CacheStats {
    return new CacheStats(0, 0, 0, 0);
  }

  /**
   * Convert to plain object
   */
  toJSON(): object {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.size,
      hitRate: this.getHitRate(),
      missRate: this.getMissRate(),
      totalRequests: this.getTotalRequests(),
    };
  }
}
