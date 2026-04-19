/**
 * Rate Limit Key
 * 
 * Represents a unique identifier for rate limiting.
 */

export class RateLimitKey {
  readonly value: string;
  readonly type: string;

  private constructor(value: string, type: string) {
    this.value = value;
    this.type = type;
  }

  /**
   * Create rate limit key
   */
  static create(value: string, type: string = 'default'): RateLimitKey {
    return new RateLimitKey(value, type);
  }

  /**
   * Create IP-based key
   */
  static fromIp(ip: string): RateLimitKey {
    return new RateLimitKey(ip, 'ip');
  }

  /**
   * Create user-based key
   */
  static fromUser(userId: string): RateLimitKey {
    return new RateLimitKey(userId, 'user');
  }

  /**
   * Create API key-based rate limit key
   */
  static fromApiKey(apiKey: string): RateLimitKey {
    return new RateLimitKey(apiKey, 'apikey');
  }

  /**
   * Create composite key from multiple identifiers
   */
  static composite(...parts: string[]): RateLimitKey {
    const value = parts.join(':');
    return new RateLimitKey(value, 'composite');
  }

  /**
   * Convert to string
   */
  toString(): string {
    return `${this.type}:${this.value}`;
  }

  /**
   * Check if two keys are equal
   */
  equals(other: RateLimitKey): boolean {
    return this.value === other.value && this.type === other.type;
  }

  /**
   * Clone the key
   */
  clone(): RateLimitKey {
    return new RateLimitKey(this.value, this.type);
  }
}
