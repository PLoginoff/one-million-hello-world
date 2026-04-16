/**
 * TTL (Time To Live) Value Object
 * 
 * Represents time-to-live duration for cache entries.
 * Immutable value object with validation.
 */

export class TTL {
  readonly value: number;
  readonly unit: TimeUnit;

  constructor(value: number, unit: TimeUnit = TimeUnit.MILLISECONDS) {
    if (value < 0) {
      throw new Error('TTL cannot be negative');
    }
    this.value = value;
    this.unit = unit;
  }

  /**
   * Create TTL in milliseconds
   */
  static milliseconds(value: number): TTL {
    return new TTL(value, TimeUnit.MILLISECONDS);
  }

  /**
   * Create TTL in seconds
   */
  static seconds(value: number): TTL {
    return new TTL(value, TimeUnit.SECONDS);
  }

  /**
   * Create TTL in minutes
   */
  static minutes(value: number): TTL {
    return new TTL(value, TimeUnit.MINUTES);
  }

  /**
   * Create TTL in hours
   */
  static hours(value: number): TTL {
    return new TTL(value, TimeUnit.HOURS);
  }

  /**
   * Convert TTL to milliseconds
   */
  toMilliseconds(): number {
    switch (this.unit) {
      case TimeUnit.MILLISECONDS:
        return this.value;
      case TimeUnit.SECONDS:
        return this.value * 1000;
      case TimeUnit.MINUTES:
        return this.value * 60 * 1000;
      case TimeUnit.HOURS:
        return this.value * 60 * 60 * 1000;
      default:
        return this.value;
    }
  }

  /**
   * Check if TTL is infinite (no expiration)
   */
  isInfinite(): boolean {
    return this.value === 0;
  }

  /**
   * Create a copy with new value
   */
  withValue(value: number): TTL {
    return new TTL(value, this.unit);
  }
}

export enum TimeUnit {
  MILLISECONDS = 'MILLISECONDS',
  SECONDS = 'SECONDS',
  MINUTES = 'MINUTES',
  HOURS = 'HOURS',
}
