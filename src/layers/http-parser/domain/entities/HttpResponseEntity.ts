/**
 * HTTP Response Entity
 * 
 * Represents a parsed HTTP response with validation and metadata.
 */

import { HttpVersion, HttpHeaders } from '../../types/http-parser-types';
import { HttpStatusLine } from '../../types/http-parser-types';

export class HttpResponseEntity {
  readonly line: HttpStatusLine;
  readonly headers: HttpHeaders;
  readonly body: Buffer;
  readonly parsedAt: Date;
  readonly size: number;

  private constructor(
    line: HttpStatusLine,
    headers: HttpHeaders,
    body: Buffer
  ) {
    this.validateStatusLine(line);
    this.validateHeaders(headers);
    this.validateBody(body);

    this.line = line;
    this.headers = headers;
    this.body = body;
    this.parsedAt = new Date();
    this.size = body.length + this.calculateHeadersSize(headers);
  }

  /**
   * Create HTTP response entity
   */
  static create(
    line: HttpStatusLine,
    headers: HttpHeaders,
    body: Buffer
  ): HttpResponseEntity {
    return new HttpResponseEntity(line, headers, body);
  }

  /**
   * Get HTTP version
   */
  getVersion(): HttpVersion {
    return this.line.version;
  }

  /**
   * Get status code
   */
  getStatusCode(): number {
    return this.line.statusCode;
  }

  /**
   * Get reason phrase
   */
  getReasonPhrase(): string {
    return this.line.reasonPhrase;
  }

  /**
   * Get header value by name
   */
  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  /**
   * Check if header exists
   */
  hasHeader(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }

  /**
   * Get content length from headers
   */
  getContentLength(): number {
    const contentLength = this.getHeader('content-length');
    return contentLength ? parseInt(contentLength, 10) : this.body.length;
  }

  /**
   * Get content type from headers
   */
  getContentType(): string | undefined {
    return this.getHeader('content-type');
  }

  /**
   * Check if response is successful (2xx)
   */
  isSuccessful(): boolean {
    return this.line.statusCode >= 200 && this.line.statusCode < 300;
  }

  /**
   * Check if response is redirection (3xx)
   */
  isRedirection(): boolean {
    return this.line.statusCode >= 300 && this.line.statusCode < 400;
  }

  /**
   * Check if response is client error (4xx)
   */
  isClientError(): boolean {
    return this.line.statusCode >= 400 && this.line.statusCode < 500;
  }

  /**
   * Check if response is server error (5xx)
   */
  isServerError(): boolean {
    return this.line.statusCode >= 500 && this.line.statusCode < 600;
  }

  /**
   * Check if response has body
   */
  hasBody(): boolean {
    return this.body.length > 0;
  }

  /**
   * Get response age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.parsedAt.getTime();
  }

  /**
   * Clone the response entity
   */
  clone(): HttpResponseEntity {
    return new HttpResponseEntity(
      { ...this.line },
      new Map(this.headers),
      Buffer.from(this.body)
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): {
    line: HttpStatusLine;
    headers: Record<string, string>;
    body: string;
    parsedAt: Date;
    size: number;
  } {
    const headersObj: Record<string, string> = {};
    this.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    return {
      line: { ...this.line },
      headers: headersObj,
      body: this.body.toString('utf-8'),
      parsedAt: this.parsedAt,
      size: this.size,
    };
  }

  private validateStatusLine(line: HttpStatusLine): void {
    if (!line.version || !line.statusCode) {
      throw new Error('Invalid status line: missing required fields');
    }

    if (!Object.values(HttpVersion).includes(line.version)) {
      throw new Error(`Invalid HTTP version: ${line.version}`);
    }

    if (line.statusCode < 100 || line.statusCode > 599) {
      throw new Error(`Invalid status code: ${line.statusCode}`);
    }
  }

  private validateHeaders(headers: HttpHeaders): void {
    if (headers.size > 100) {
      throw new Error('Header count exceeds maximum of 100');
    }

    headers.forEach((value, key) => {
      if (key.length > 128) {
        throw new Error(`Header name length exceeds maximum of 128: ${key}`);
      }
      if (value.length > 8192) {
        throw new Error(`Header value length exceeds maximum of 8192: ${key}`);
      }
    });
  }

  private validateBody(body: Buffer): void {
    if (body.length > 10485760) {
      throw new Error('Body size exceeds maximum of 10MB');
    }
  }

  private calculateHeadersSize(headers: HttpHeaders): number {
    let size = 0;
    headers.forEach((value, key) => {
      size += key.length + value.length + 4; // ": " + "\r\n"
    });
    return size;
  }
}
