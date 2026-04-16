/**
 * Cache Entry Entity
 * 
 * Represents a single cache entry with metadata.
 * Immutable entity that stores cached data with access tracking.
 */

export class CacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly ttl: number;
  readonly createdAt: number;
  accessCount: number;
  lastAccessedAt: number;

  constructor(
    key: string,
    value: T,
    ttl: number,
    createdAt: number = Date.now(),
  ) {
    this.key = key;
    this.value = value;
    this.ttl = ttl;
    this.createdAt = createdAt;
    this.accessCount = 0;
    this.lastAccessedAt = createdAt;
  }

  /**
   * Check if entry is expired based on current time
   */
  isExpired(currentTime: number = Date.now()): boolean {
    if (this.ttl <= 0) return false;
    return currentTime - this.createdAt > this.ttl;
  }

  /**
   * Record access to this entry
   */
  recordAccess(currentTime: number = Date.now()): void {
    this.accessCount++;
    this.lastAccessedAt = currentTime;
  }

  /**
   * Get time since last access
   */
  getTimeSinceLastAccess(currentTime: number = Date.now()): number {
    return currentTime - this.lastAccessedAt;
  }

  /**
   * Create a copy of this entry
   */
  clone(): CacheEntry<T> {
    const cloned = new CacheEntry<T>(this.key, this.value, this.ttl, this.createdAt);
    cloned.accessCount = this.accessCount;
    cloned.lastAccessedAt = this.lastAccessedAt;
    return cloned;
  }
}
