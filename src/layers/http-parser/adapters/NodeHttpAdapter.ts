/**
 * HTTP Parser Node.js Adapter
 *
 * Real implementation using Node.js HTTP/HTTPS modules for parsing.
 *
 * @module HttpParserLayer/Adapters
 */

import { HttpParserInMemoryAdapter } from './InMemoryAdapter';
import { HttpParserErrorFactory } from '../errors';
import { HttpRequestEntity } from '../domain/entities/HttpRequestEntity';
import { HttpResponseEntity } from '../domain/entities/HttpResponseEntity';
import { HttpHeaderEntity } from '../domain/entities/HttpHeaderEntity';
import { HttpRequestLine, HttpStatusLine, HttpHeaders, ParserConfig, ParseResult } from '../types/http-parser-types';

export interface NodeHttpAdapterOptions {
  timeout: number;
  maxHeaderSize: number;
  maxBodySize: number;
  strictMode: boolean;
  allowChunkedEncoding: boolean;
  maxHeaderCount: number;
  maxUrlLength: number;
}

const DEFAULT_OPTIONS: NodeHttpAdapterOptions = {
  timeout: 30000,
  maxHeaderSize: 8192,
  maxBodySize: 10485760,
  strictMode: true,
  allowChunkedEncoding: true,
  maxHeaderCount: 100,
  maxUrlLength: 2048,
};

export class HttpParserNodeAdapter extends HttpParserInMemoryAdapter {
  private readonly options: NodeHttpAdapterOptions;
  private readonly http: typeof import('http');
  private readonly https: typeof import('https');

  constructor(options: Partial<NodeHttpAdapterOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.http = require('http');
    this.https = require('https');
  }

  /**
   * Parse raw HTTP request from buffer using Node.js parser
   */
  parseRequest(raw: Buffer, config?: Partial<ParserConfig>): ParseResult<HttpRequestEntity> {
    const startTime = Date.now();

    try {
      // Use Node.js built-in HTTP parser
      const parser = new this.http.Parser(this.http.Parser.REQUEST);

      // Configure parser
      parser.maxHeaderSize = config?.maxHeaderSize ?? this.options.maxHeaderSize;
      parser.maxBodySize = config?.maxBodySize ?? this.options.maxBodySize;

      let requestEntity: HttpRequestEntity | null = null;
      let parseError: Error | null = null;
      let headersComplete = false;
      let bodyComplete = false;

      parser.onHeadersComplete = (result: {
        method: string;
        url: string;
        httpVersion: string;
        headers: string[];
        rawHeaders: string[];
      }) => {
        headersComplete = true;

        // Validate header count
        if (result.rawHeaders.length / 2 > (config?.maxHeaderCount ?? this.options.maxHeaderCount)) {
          parseError = HttpParserErrorFactory.tooManyHeaders(
            result.rawHeaders.length / 2,
            config?.maxHeaderCount ?? this.options.maxHeaderCount
          );
          return;
        }

        // Validate URL length
        if (result.url.length > (config?.maxUrlLength ?? this.options.maxUrlLength)) {
          parseError = HttpParserErrorFactory.urlTooLong(
            result.url,
            result.url.length,
            config?.maxUrlLength ?? this.options.maxUrlLength
          );
          return;
        }

        // Build headers map
        const headers = new Map<string, string>();
        for (let i = 0; i < result.rawHeaders.length; i += 2) {
          const name = result.rawHeaders[i].toLowerCase();
          const value = result.rawHeaders[i + 1];
          headers.set(name, value);
        }

        // Validate header size
        let headerSize = 0;
        for (const [name, value] of headers.entries()) {
          headerSize += name.length + value.length + 4; // ": " + "\r\n"
        }
        if (headerSize > (config?.maxHeaderSize ?? this.options.maxHeaderSize)) {
          parseError = HttpParserErrorFactory.headerTooLarge(
            headerSize,
            config?.maxHeaderSize ?? this.options.maxHeaderSize
          );
          return;
        }

        const requestLine: HttpRequestLine = {
          method: result.method as any,
          path: result.url,
          version: `HTTP/${result.httpVersion}`,
        };

        requestEntity = HttpRequestEntity.create(requestLine, headers, Buffer.alloc(0), raw);
      };

      parser.onBody = (chunk: Buffer) => {
        if (requestEntity) {
          const currentBody = requestEntity.body;
          const newBody = Buffer.concat([currentBody, chunk]);

          // Validate body size
          if (newBody.length > (config?.maxBodySize ?? this.options.maxBodySize)) {
            parseError = HttpParserErrorFactory.bodyTooLarge(
              newBody.length,
              config?.maxBodySize ?? this.options.maxBodySize
            );
            return;
          }

          // Update entity with new body
          requestEntity = HttpRequestEntity.create(
            requestEntity.requestLine,
            requestEntity.headers,
            newBody,
            requestEntity.raw
          );
        }
      };

      parser.onMessageComplete = () => {
        bodyComplete = true;
      };

      parser.onError = (error: Error) => {
        parseError = HttpParserErrorFactory.parseError(
          'HTTP_PARSER_PARSE_ERROR',
          error.message,
          'parsing',
          raw.length,
          raw.length
        );
      };

      // Execute parse
      parser.execute(raw);

      if (parseError) {
        return {
          success: false,
          error: {
            code: parseError.name,
            message: parseError.message,
          },
        };
      }

      if (!headersComplete) {
        return {
          success: false,
          error: {
            code: 'HTTP_PARSER_INCOMPLETE_REQUEST',
            message: 'Incomplete HTTP request: headers not complete',
          },
        };
      }

      if (!bodyComplete && requestEntity) {
        // Check if we need to wait for more body data
        const contentLength = requestEntity.headers.get('content-length');
        if (contentLength) {
          const expectedLength = parseInt(contentLength, 10);
          if (requestEntity.body.length < expectedLength) {
            return {
              success: false,
              error: {
                code: 'HTTP_PARSER_INCOMPLETE_REQUEST',
                message: `Incomplete body: expected ${expectedLength} bytes, got ${requestEntity.body.length}`,
              },
            };
          }
        }
      }

      const parseTime = Date.now() - startTime;

      return {
        success: true,
        data: requestEntity!,
        metadata: {
          parseTime,
          bytesProcessed: raw.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HTTP_PARSER_EXECUTION_ERROR',
          message: `Parse failed: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Parse HTTP response from buffer
   */
  parseResponse(raw: Buffer, config?: Partial<ParserConfig>): ParseResult<HttpResponseEntity> {
    const startTime = Date.now();

    try {
      const parser = new this.http.Parser(this.http.Parser.RESPONSE);

      parser.maxHeaderSize = config?.maxHeaderSize ?? this.options.maxHeaderSize;
      parser.maxBodySize = config?.maxBodySize ?? this.options.maxBodySize;

      let responseEntity: HttpResponseEntity | null = null;
      let parseError: Error | null = null;
      let headersComplete = false;
      let bodyComplete = false;

      parser.onHeadersComplete = (result: {
        statusCode: number;
        httpVersion: string;
        headers: string[];
        rawHeaders: string[];
      }) => {
        headersComplete = true;

        if (result.rawHeaders.length / 2 > (config?.maxHeaderCount ?? this.options.maxHeaderCount)) {
          parseError = HttpParserErrorFactory.tooManyHeaders(
            result.rawHeaders.length / 2,
            config?.maxHeaderCount ?? this.options.maxHeaderCount
          );
          return;
        }

        const headers = new Map<string, string>();
        for (let i = 0; i < result.rawHeaders.length; i += 2) {
          const name = result.rawHeaders[i].toLowerCase();
          const value = result.rawHeaders[i + 1];
          headers.set(name, value);
        }

        let headerSize = 0;
        for (const [name, value] of headers.entries()) {
          headerSize += name.length + value.length + 4;
        }
        if (headerSize > (config?.maxHeaderSize ?? this.options.maxHeaderSize)) {
          parseError = HttpParserErrorFactory.headerTooLarge(
            headerSize,
            config?.maxHeaderSize ?? this.options.maxHeaderSize
          );
          return;
        }

        const statusLine: HttpStatusLine = {
          version: `HTTP/${result.httpVersion}`,
          statusCode: result.statusCode,
          statusMessage: this.http.STATUS_CODES[result.statusCode] || 'Unknown',
        };

        responseEntity = HttpResponseEntity.create(statusLine, headers, Buffer.alloc(0));
      };

      parser.onBody = (chunk: Buffer) => {
        if (responseEntity) {
          const currentBody = responseEntity.body;
          const newBody = Buffer.concat([currentBody, chunk]);

          if (newBody.length > (config?.maxBodySize ?? this.options.maxBodySize)) {
            parseError = HttpParserErrorFactory.bodyTooLarge(
              newBody.length,
              config?.maxBodySize ?? this.options.maxBodySize
            );
            return;
          }

          responseEntity = HttpResponseEntity.create(responseEntity.statusLine, responseEntity.headers, newBody);
        }
      };

      parser.onMessageComplete = () => {
        bodyComplete = true;
      };

      parser.onError = (error: Error) => {
        parseError = HttpParserErrorFactory.parseError(
          'HTTP_PARSER_PARSE_ERROR',
          error.message,
          'parsing',
          raw.length,
          raw.length
        );
      };

      parser.execute(raw);

      if (parseError) {
        return {
          success: false,
          error: {
            code: parseError.name,
            message: parseError.message,
          },
        };
      }

      if (!headersComplete) {
        return {
          success: false,
          error: {
            code: 'HTTP_PARSER_INCOMPLETE_REQUEST',
            message: 'Incomplete HTTP response: headers not complete',
          },
        };
      }

      const parseTime = Date.now() - startTime;

      return {
        success: true,
        data: responseEntity!,
        metadata: {
          parseTime,
          bytesProcessed: raw.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HTTP_PARSER_EXECUTION_ERROR',
          message: `Parse failed: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Make HTTP request and parse response
   */
  async fetch(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: Buffer | string;
      timeout?: number;
    } = {}
  ): Promise<ParseResult<HttpResponseEntity>> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? this.https : this.http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout ?? this.options.timeout,
      };

      if (options.body) {
        const bodyBuffer = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body);
        requestOptions.headers['Content-Length'] = bodyBuffer.length.toString();
      }

      const req = client.request(requestOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const rawResponse = Buffer.concat(chunks);
          // Reconstruct raw response with status line and headers
          const statusLine = `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}\r\n`;
          const headerLines = Object.entries(res.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n');
          const raw = Buffer.from(`${statusLine}${headerLines}\r\n\r\n`);
          const fullRaw = Buffer.concat([raw, rawResponse]);

          const result = this.parseResponse(fullRaw);
          resolve(result);
        });
      });

      req.on('error', (error: Error) => {
        resolve({
          success: false,
          error: {
            code: 'HTTP_PARSER_EXECUTION_ERROR',
            message: `Request failed: ${error.message}`,
          },
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: {
            code: 'HTTP_PARSER_TIMEOUT',
            message: 'Request timeout',
          },
        });
      });

      if (options.body) {
        const bodyBuffer = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body);
        req.write(bodyBuffer);
      }

      req.end();
    });
  }

  /**
   * Parse request line only
   */
  parseRequestLine(line: string): ParseResult<{ method: string; path: string; version: string }> {
    try {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 3) {
        return {
          success: false,
          error: {
            code: 'HTTP_PARSER_INVALID_REQUEST_LINE',
            message: 'Invalid request line format',
          },
        };
      }

      const [method, path, version] = parts;

      // Validate method
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
      if (!validMethods.includes(method.toUpperCase())) {
        return {
          success: false,
          error: {
            code: 'HTTP_PARSER_UNSUPPORTED_METHOD',
            message: `Unsupported method: ${method}`,
          },
        };
      }

      // Validate version
      if (!version.match(/^HTTP\/\d\.\d$/)) {
        return {
          success: false,
          error: {
            code: 'HTTP_PARSER_UNSUPPORTED_VERSION',
            message: `Unsupported version: ${version}`,
          },
        };
      }

      return {
        success: true,
        data: { method: method.toUpperCase(), path, version },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HTTP_PARSER_EXECUTION_ERROR',
          message: `Request line parse failed: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Parse headers only
   */
  parseHeaders(headerLines: string[]): ParseResult<HttpHeaders> {
    try {
      const headers = new Map<string, string>();

      for (const line of headerLines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
          return {
            success: false,
            error: {
              code: 'HTTP_PARSER_INVALID_HEADERS',
              message: `Invalid header line: ${line}`,
            },
          };
        }

        const name = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();

        if (headers.has(name)) {
          // Handle duplicate headers by joining with comma
          headers.set(name, `${headers.get(name)}, ${value}`);
        } else {
          headers.set(name, value);
        }
      }

      return {
        success: true,
        data: headers,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HTTP_PARSER_EXECUTION_ERROR',
          message: `Headers parse failed: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * Validate request entity
   */
  validate(request: HttpRequestEntity): boolean {
    try {
      // Check required fields
      if (!request.requestLine.method || !request.requestLine.path || !request.requestLine.version) {
        return false;
      }

      // Check method
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
      if (!validMethods.includes(request.requestLine.method)) {
        return false;
      }

      // Check version
      if (!request.requestLine.version.match(/^HTTP\/\d\.\d$/)) {
        return false;
      }

      // Check header count
      if (request.headers.size > this.options.maxHeaderCount) {
        return false;
      }

      // Check body size
      if (request.body.length > this.options.maxBodySize) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): NodeHttpAdapterOptions {
    return { ...this.options };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<NodeHttpAdapterOptions>): void {
    Object.assign(this.options, updates);
  }
}

export class HttpParserNodeAdapterFactory {
  static create(options?: Partial<NodeHttpAdapterOptions>): HttpParserNodeAdapter {
    return new HttpParserNodeAdapter(options);
  }

  static createWithDefaults(): HttpParserNodeAdapter {
    return new HttpParserNodeAdapter();
  }
}
