/**
 * Cache Key Entity
 * 
 * Represents a cache key with validation and pattern matching capabilities.
 */

export class CacheKey {
  readonly value: string;
  readonly pattern: RegExp | null;

  private constructor(value: string, pattern: RegExp | null = null) {
    if (!value || value.length === 0) {
      throw new Error('Cache key cannot be empty');
    }
    if (value.length > 255) {
      throw new Error('Cache key cannot exceed 255 characters');
    }
    this.value = value;
    this.pattern = pattern;
  }

  /**
   * Create a regular cache key
   */
  static create(value: string): CacheKey {
    return new CacheKey(value);
  }

  /**
   * Create a cache key from pattern
   */
  static fromPattern(pattern: string): CacheKey {
    return new CacheKey(pattern, new RegExp(pattern));
  }

  /**
   * Check if this key matches a pattern
   */
  matches(pattern: RegExp): boolean {
    return pattern.test(this.value);
  }

  /**
   * Check if this key equals another key
   */
  equals(other: CacheKey): boolean {
    return this.value === other.value;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Get hash of the key for quick comparisons
   */
  getHash(): number {
    let hash = 0;
    for (let i = 0; i < this.value.length; i++) {
      const char = this.value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }
}
