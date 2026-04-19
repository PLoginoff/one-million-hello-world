/**
 * Rate Limit Window Value Object
 * 
 * Represents a time window for rate limiting.
 */

export class RateLimitWindowValueObject {
  readonly milliseconds: number;
  readonly seconds: number;
  readonly minutes: number;
  readonly hours: number;

  private constructor(milliseconds: number) {
    this.milliseconds = milliseconds;
    this.seconds = Math.floor(milliseconds / 1000);
    this.minutes = Math.floor(this.seconds / 60);
    this.hours = Math.floor(this.minutes / 60);
  }

  /**
   * Create rate limit window from milliseconds
   */
  static fromMilliseconds(milliseconds: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(milliseconds);
  }

  /**
   * Create rate limit window from seconds
   */
  static fromSeconds(seconds: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(seconds * 1000);
  }

  /**
   * Create rate limit window from minutes
   */
  static fromMinutes(minutes: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(minutes * 60 * 1000);
  }

  /**
   * Create rate limit window from hours
   */
  static fromHours(hours: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(hours * 60 * 60 * 1000);
  }

  /**
   * Create 1 minute window
   */
  static oneMinute(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(60 * 1000);
  }

  /**
   * Create 5 minute window
   */
  static fiveMinutes(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(5 * 60 * 1000);
  }

  /**
   * Create 15 minute window
   */
  static fifteenMinutes(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(15 * 60 * 1000);
  }

  /**
   * Create 1 hour window
   */
  static oneHour(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(60 * 60 * 1000);
  }

  /**
   * Create 24 hour window
   */
  static oneDay(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(24 * 60 * 60 * 1000);
  }

  /**
   * Add milliseconds to window
   */
  addMilliseconds(ms: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(this.milliseconds + ms);
  }

  /**
   * Subtract milliseconds from window
   */
  subtractMilliseconds(ms: number): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(Math.max(0, this.milliseconds - ms));
  }

  /**
   * Check if window is greater than other
   */
  isGreaterThan(other: RateLimitWindowValueObject): boolean {
    return this.milliseconds > other.milliseconds;
  }

  /**
   * Check if window is less than other
   */
  isLessThan(other: RateLimitWindowValueObject): boolean {
    return this.milliseconds < other.milliseconds;
  }

  /**
   * Clone the value object
   */
  clone(): RateLimitWindowValueObject {
    return new RateLimitWindowValueObject(this.milliseconds);
  }

  /**
   * Convert to string
   */
  toString(): string {
    if (this.hours > 0) return `${this.hours}h`;
    if (this.minutes > 0) return `${this.minutes}m`;
    if (this.seconds > 0) return `${this.seconds}s`;
    return `${this.milliseconds}ms`;
  }

  /**
   * Check if two windows are equal
   */
  equals(other: RateLimitWindowValueObject): boolean {
    return this.milliseconds === other.milliseconds;
  }
}
