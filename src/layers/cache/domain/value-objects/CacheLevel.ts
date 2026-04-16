/**
 * Cache Level Value Object
 * 
 * Represents cache hierarchy level (L1, L2, L3).
 * Immutable value object with ordering capabilities.
 */

export class CacheLevel {
  readonly value: string;
  readonly priority: number;

  constructor(value: string, priority: number) {
    this.value = value;
    this.priority = priority;
  }

  /**
   * L1 cache - fastest, smallest
   */
  static L1(): CacheLevel {
    return new CacheLevel('L1', 1);
  }

  /**
   * L2 cache - medium speed, medium size
   */
  static L2(): CacheLevel {
    return new CacheLevel('L2', 2);
  }

  /**
   * L3 cache - slowest, largest
   */
  static L3(): CacheLevel {
    return new CacheLevel('L3', 3);
  }

  /**
   * Create from string
   */
  static fromString(value: string): CacheLevel {
    switch (value.toUpperCase()) {
      case 'L1':
        return CacheLevel.L1();
      case 'L2':
        return CacheLevel.L2();
      case 'L3':
        return CacheLevel.L3();
      default:
        throw new Error(`Invalid cache level: ${value}`);
    }
  }

  /**
   * Check if this level is higher than another
   */
  isHigherThan(other: CacheLevel): boolean {
    return this.priority < other.priority;
  }

  /**
   * Check if this level is lower than another
   */
  isLowerThan(other: CacheLevel): boolean {
    return this.priority > other.priority;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }
}
