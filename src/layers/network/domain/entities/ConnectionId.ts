/**
 * Connection ID Entity
 * 
 * Represents a unique identifier for a network connection.
 * Provides validation and formatting capabilities.
 */

export class ConnectionId {
  readonly value: string;
  readonly prefix: string;
  readonly timestamp: number;

  private constructor(value: string, prefix: string, timestamp: number) {
    if (!value || value.length === 0) {
      throw new Error('Connection ID cannot be empty');
    }
    if (value.length > 128) {
      throw new Error('Connection ID cannot exceed 128 characters');
    }
    this.value = value;
    this.prefix = prefix;
    this.timestamp = timestamp;
  }

  /**
   * Create a new connection ID with default prefix
   */
  static create(): ConnectionId {
    const prefix = 'conn';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const value = `${prefix}_${timestamp}_${random}`;
    return new ConnectionId(value, prefix, timestamp);
  }

  /**
   * Create a connection ID from existing string
   */
  static fromString(value: string): ConnectionId {
    const parts = value.split('_');
    const prefix = parts[0] || 'conn';
    const timestamp = parts[1] ? parseInt(parts[1], 10) : Date.now();
    return new ConnectionId(value, prefix, timestamp);
  }

  /**
   * Create a connection ID with custom prefix
   */
  static withPrefix(prefix: string): ConnectionId {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const value = `${prefix}_${timestamp}_${random}`;
    return new ConnectionId(value, prefix, timestamp);
  }

  /**
   * Check if this ID equals another ID
   */
  equals(other: ConnectionId): boolean {
    return this.value === other.value;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Get hash of the ID for quick comparisons
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

  /**
   * Get age of the connection ID in milliseconds
   */
  getAge(): number {
    return Date.now() - this.timestamp;
  }

  /**
   * Check if connection ID is expired
   */
  isExpired(maxAge: number): boolean {
    return this.getAge() > maxAge;
  }

  /**
   * Get prefix of the connection ID
   */
  getPrefix(): string {
    return this.prefix;
  }

  /**
   * Validate connection ID format
   */
  isValid(): boolean {
    return this.value.length > 0 && this.value.length <= 128;
  }
}
