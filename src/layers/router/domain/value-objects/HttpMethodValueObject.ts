/**
 * HTTP Method Value Object
 * 
 * Represents HTTP method types.
 */

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

export class HttpMethodValueObject {
  readonly value: HttpMethod;

  private constructor(value: HttpMethod) {
    this.value = value;
  }

  /**
   * Create HTTP method value object
   */
  static create(value: HttpMethod): HttpMethodValueObject {
    return new HttpMethodValueObject(value);
  }

  /**
   * Create GET method
   */
  static get(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.GET);
  }

  /**
   * Create POST method
   */
  static post(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.POST);
  }

  /**
   * Create PUT method
   */
  static put(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.PUT);
  }

  /**
   * Create DELETE method
   */
  static delete(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.DELETE);
  }

  /**
   * Create PATCH method
   */
  static patch(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.PATCH);
  }

  /**
   * Create HEAD method
   */
  static head(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.HEAD);
  }

  /**
   * Create OPTIONS method
   */
  static options(): HttpMethodValueObject {
    return new HttpMethodValueObject(HttpMethod.OPTIONS);
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
   * Check if method is safe (GET, HEAD, OPTIONS)
   */
  isSafe(): boolean {
    return [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].includes(this.value);
  }

  /**
   * Check if method is idempotent (GET, HEAD, OPTIONS, PUT, DELETE)
   */
  isIdempotent(): boolean {
    return [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS, HttpMethod.PUT, HttpMethod.DELETE].includes(this.value);
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
}
