/**
 * HTTP Version Value Object
 * 
 * Represents HTTP version with validation and comparison capabilities.
 */

import { HttpVersion } from '../../types/http-parser-types';

export class HttpVersionValueObject {
  readonly value: HttpVersion;
  readonly major: number;
  readonly minor: number;

  private constructor(value: HttpVersion) {
    this.value = value;
    const { major, minor } = this.parseVersion(value);
    this.major = major;
    this.minor = minor;
  }

  /**
   * Create HTTP version value object
   */
  static create(value: HttpVersion): HttpVersionValueObject {
    return new HttpVersionValueObject(value);
  }

  /**
   * Create from string
   */
  static fromString(version: string): HttpVersionValueObject {
    if (!Object.values(HttpVersion).includes(version as HttpVersion)) {
      throw new Error(`Invalid HTTP version: ${version}`);
    }
    return new HttpVersionValueObject(version as HttpVersion);
  }

  /**
   * Create HTTP/1.0
   */
  static http10(): HttpVersionValueObject {
    return new HttpVersionValueObject(HttpVersion.HTTP_1_0);
  }

  /**
   * Create HTTP/1.1
   */
  static http11(): HttpVersionValueObject {
    return new HttpVersionValueObject(HttpVersion.HTTP_1_1);
  }

  /**
   * Create HTTP/2
   */
  static http2(): HttpVersionValueObject {
    return new HttpVersionValueObject(HttpVersion.HTTP_2);
  }

  /**
   * Check if version is HTTP/1.0
   */
  isHttp10(): boolean {
    return this.value === HttpVersion.HTTP_1_0;
  }

  /**
   * Check if version is HTTP/1.1
   */
  isHttp11(): boolean {
    return this.value === HttpVersion.HTTP_1_1;
  }

  /**
   * Check if version is HTTP/2
   */
  isHttp2(): boolean {
    return this.value === HttpVersion.HTTP_2;
  }

  /**
   * Check if version is HTTP/1.x
   */
  isHttp1(): boolean {
    return this.isHttp10() || this.isHttp11();
  }

  /**
   * Check if this version is greater than another
   */
  greaterThan(other: HttpVersionValueObject): boolean {
    if (this.major !== other.major) {
      return this.major > other.major;
    }
    return this.minor > other.minor;
  }

  /**
   * Check if this version is less than another
   */
  lessThan(other: HttpVersionValueObject): boolean {
    if (this.major !== other.major) {
      return this.major < other.major;
    }
    return this.minor < other.minor;
  }

  /**
   * Check if this version is greater than or equal to another
   */
  greaterThanOrEqual(other: HttpVersionValueObject): boolean {
    return this.greaterThan(other) || this.equals(other);
  }

  /**
   * Check if this version is less than or equal to another
   */
  lessThanOrEqual(other: HttpVersionValueObject): boolean {
    return this.lessThan(other) || this.equals(other);
  }

  /**
   * Check if version supports persistent connections
   */
  supportsPersistentConnections(): boolean {
    return this.isHttp11() || this.isHttp2();
  }

  /**
   * Check if version supports chunked encoding
   */
  supportsChunkedEncoding(): boolean {
    return this.isHttp11() || this.isHttp2();
  }

  /**
   * Check if version supports compression
   */
  supportsCompression(): boolean {
    return this.isHttp11() || this.isHttp2();
  }

  /**
   * Clone the value object
   */
  clone(): HttpVersionValueObject {
    return new HttpVersionValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two versions are equal
   */
  equals(other: HttpVersionValueObject): boolean {
    return this.value === other.value;
  }

  private parseVersion(version: HttpVersion): { major: number; minor: number } {
    const match = version.match(/HTTP\/(\d+)\.(\d+)/);
    if (!match) {
      return { major: 1, minor: 1 };
    }
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
    };
  }
}
