/**
 * HTTP Method Value Object
 * 
 * Represents HTTP method with validation and metadata.
 */

import { HttpMethod } from '../../types/http-parser-types';

export class HttpMethodValueObject {
  readonly value: HttpMethod;
  readonly isSafe: boolean;
  readonly isIdempotent: boolean;
  readonly hasBody: boolean;

  private constructor(value: HttpMethod) {
    this.value = value;
    this.isSafe = this.determineIfSafe(value);
    this.isIdempotent = this.determineIfIdempotent(value);
    this.hasBody = this.determineIfHasBody(value);
  }

  /**
   * Create HTTP method value object
   */
  static create(value: HttpMethod): HttpMethodValueObject {
    return new HttpMethodValueObject(value);
  }

  /**
   * Create from string
   */
  static fromString(method: string): HttpMethodValueObject {
    if (!Object.values(HttpMethod).includes(method as HttpMethod)) {
      throw new Error(`Invalid HTTP method: ${method}`);
    }
    return new HttpMethodValueObject(method as HttpMethod);
  }

  /**
   * Check if method is GET
   */
  isGet(): boolean {
    return this.value === HttpMethod.GET;
  }

  /**
   * Check if method is POST
   */
  isPost(): boolean {
    return this.value === HttpMethod.POST;
  }

  /**
   * Check if method is PUT
   */
  isPut(): boolean {
    return this.value === HttpMethod.PUT;
  }

  /**
   * Check if method is DELETE
   */
  isDelete(): boolean {
    return this.value === HttpMethod.DELETE;
  }

  /**
   * Check if method is PATCH
   */
  isPatch(): boolean {
    return this.value === HttpMethod.PATCH;
  }

  /**
   * Check if method is HEAD
   */
  isHead(): boolean {
    return this.value === HttpMethod.HEAD;
  }

  /**
   * Check if method is OPTIONS
   */
  isOptions(): boolean {
    return this.value === HttpMethod.OPTIONS;
  }

  /**
   * Check if method is TRACE
   */
  isTrace(): boolean {
    return this.value === HttpMethod.TRACE;
  }

  /**
   * Check if method is CONNECT
   */
  isConnect(): boolean {
    return this.value === HttpMethod.CONNECT;
  }

  /**
   * Check if method allows caching
   */
  isCacheable(): boolean {
    return this.value === HttpMethod.GET || this.value === HttpMethod.HEAD;
  }

  /**
   * Clone the value object
   */
  clone(): HttpMethodValueObject {
    return new HttpMethodValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two methods are equal
   */
  equals(other: HttpMethodValueObject): boolean {
    return this.value === other.value;
  }

  private determineIfSafe(method: HttpMethod): boolean {
    return [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS, HttpMethod.TRACE].includes(method);
  }

  private determineIfIdempotent(method: HttpMethod): boolean {
    return [
      HttpMethod.GET,
      HttpMethod.HEAD,
      HttpMethod.PUT,
      HttpMethod.DELETE,
      HttpMethod.OPTIONS,
      HttpMethod.TRACE,
    ].includes(method);
  }

  private determineIfHasBody(method: HttpMethod): boolean {
    return [HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH].includes(method);
  }
}
