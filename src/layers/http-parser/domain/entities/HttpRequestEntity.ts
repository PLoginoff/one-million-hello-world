/**
 * HTTP Request Entity
 * 
 * Represents a parsed HTTP request with validation and metadata.
 */

import { HttpMethod, HttpVersion, HttpHeaders } from '../../types/http-parser-types';
import { HttpRequestLine } from '../../types/http-parser-types';

export class HttpRequestEntity {
  readonly line: HttpRequestLine;
  readonly headers: HttpHeaders;
  readonly body: Buffer;
  readonly raw: Buffer;
  readonly parsedAt: Date;
  readonly size: number;

  private constructor(
    line: HttpRequestLine,
    headers: HttpHeaders,
    body: Buffer,
    raw: Buffer
  ) {
    this.validateRequestLine(line);
    this.validateHeaders(headers);
    this.validateBody(body);

    this.line = line;
    this.headers = headers;
    this.body = body;
    this.raw = raw;
    this.parsedAt = new Date();
    this.size = raw.length;
  }

  /**
   * Create HTTP request entity
   */
  static create(
    line: HttpRequestLine,
    headers: HttpHeaders,
    body: Buffer,
    raw: Buffer
  ): HttpRequestEntity {
    return new HttpRequestEntity(line, headers, body, raw);
  }

  /**
   * Create from raw buffer
   */
  static fromRaw(raw: Buffer): HttpRequestEntity {
    const rawString = raw.toString('utf-8');
    const lines = rawString.split('\r\n');

    if (lines.length < 1) {
      throw new Error('Empty request');
    }

    const requestLine = HttpRequestEntity.parseRequestLine(lines[0]);
    const emptyLineIndex = lines.indexOf('');
    
    if (emptyLineIndex === -1) {
      throw new Error('Missing empty line between headers and body');
    }

    const headerLines = lines.slice(1, emptyLineIndex);
    const headers = HttpRequestEntity.parseHeaders(headerLines);
    
    const bodyStart = emptyLineIndex + 1;
    const bodyLines = lines.slice(bodyStart);
    const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

    return new HttpRequestEntity(requestLine, headers, body, raw);
  }

  /**
   * Get HTTP method
   */
  getMethod(): HttpMethod {
    return this.line.method;
  }

  /**
   * Get request path
   */
  getPath(): string {
    return this.line.path;
  }

  /**
   * Get HTTP version
   */
  getVersion(): HttpVersion {
    return this.line.version;
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
   * Check if request has body
   */
  hasBody(): boolean {
    return this.body.length > 0;
  }

  /**
   * Get request age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.parsedAt.getTime();
  }

  /**
   * Clone the request entity
   */
  clone(): HttpRequestEntity {
    return new HttpRequestEntity(
      { ...this.line },
      new Map(this.headers),
      Buffer.from(this.body),
      Buffer.from(this.raw)
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): {
    line: HttpRequestLine;
    headers: Record<string, string>;
    body: string;
    raw: string;
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
      raw: this.raw.toString('utf-8'),
      parsedAt: this.parsedAt,
      size: this.size,
    };
  }

  private validateRequestLine(line: HttpRequestLine): void {
    if (!line.method || !line.path || !line.version) {
      throw new Error('Invalid request line: missing required fields');
    }

    if (!Object.values(HttpMethod).includes(line.method)) {
      throw new Error(`Invalid HTTP method: ${line.method}`);
    }

    if (!Object.values(HttpVersion).includes(line.version)) {
      throw new Error(`Invalid HTTP version: ${line.version}`);
    }

    if (line.path.length > 2048) {
      throw new Error('Path length exceeds maximum of 2048 characters');
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

  private static parseRequestLine(line: string): HttpRequestLine {
    const parts = line.split(' ');

    if (parts.length !== 3) {
      throw new Error(`Invalid request line format: ${line}`);
    }

    const [method, path, version] = parts;

    if (!Object.values(HttpMethod).includes(method as HttpMethod)) {
      throw new Error(`Invalid HTTP method: ${method}`);
    }

    if (!Object.values(HttpVersion).includes(version as HttpVersion)) {
      throw new Error(`Invalid HTTP version: ${version}`);
    }

    return {
      method: method as HttpMethod,
      path,
      version: version as HttpVersion,
    };
  }

  private static parseHeaders(headerLines: string[]): HttpHeaders {
    const headers = new Map<string, string>();

    for (const line of headerLines) {
      if (!line.trim()) {
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        throw new Error(`Invalid header format: ${line}`);
      }

      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (!name) {
        throw new Error('Header name cannot be empty');
      }

      headers.set(name.toLowerCase(), value);
    }

    return headers;
  }
}
