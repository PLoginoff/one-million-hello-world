/**
 * HTTP Parsing Service
 * 
 * Provides high-level parsing operations for HTTP requests and responses.
 */

import { HttpRequest, HttpResponse, HttpRequestLine, HttpStatusLine, HttpHeaders } from '../../types/http-parser-types';
import { HttpMethod, HttpVersion, ParseErrorCode } from '../../types/http-parser-types';
import { HttpValidationService } from './HttpValidationService';

export class HttpParsingService {
  /**
   * Parse request line from string
   */
  static parseRequestLine(line: string): {
    success: boolean;
    data?: HttpRequestLine;
    error?: string;
  } {
    const parts = line.split(' ');

    if (parts.length !== 3) {
      return {
        success: false,
        error: `Invalid request line format: ${line}`,
      };
    }

    const [method, path, version] = parts;

    if (!HttpValidationService.validateMethod(method)) {
      return {
        success: false,
        error: `Invalid HTTP method: ${method}`,
      };
    }

    if (!HttpValidationService.validateVersion(version)) {
      return {
        success: false,
        error: `Invalid HTTP version: ${version}`,
      };
    }

    if (!HttpValidationService.validatePath(path)) {
      return {
        success: false,
        error: `Invalid path: ${path}`,
      };
    }

    return {
      success: true,
      data: {
        method: method as HttpMethod,
        path,
        version: version as HttpVersion,
      },
    };
  }

  /**
   * Parse status line from string
   */
  static parseStatusLine(line: string): {
    success: boolean;
    data?: HttpStatusLine;
    error?: string;
  } {
    const parts = line.split(' ');

    if (parts.length < 2) {
      return {
        success: false,
        error: `Invalid status line format: ${line}`,
      };
    }

    const [version, statusCode, ...reasonParts] = parts;
    const reasonPhrase = reasonParts.join(' ');

    if (!HttpValidationService.validateVersion(version)) {
      return {
        success: false,
        error: `Invalid HTTP version: ${version}`,
      };
    }

    const statusCodeNum = parseInt(statusCode, 10);
    if (!HttpValidationService.validateStatusCode(statusCodeNum)) {
      return {
        success: false,
        error: `Invalid status code: ${statusCode}`,
      };
    }

    return {
      success: true,
      data: {
        version: version as HttpVersion,
        statusCode: statusCodeNum,
        reasonPhrase,
      },
    };
  }

  /**
   * Parse headers from array of strings
   */
  static parseHeaders(headerLines: string[]): {
    success: boolean;
    data?: HttpHeaders;
    error?: string;
  } {
    const headers = new Map<string, string>();

    for (const line of headerLines) {
      if (!line.trim()) {
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        return {
          success: false,
          error: `Invalid header format: ${line}`,
        };
      }

      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (!HttpValidationService.validateHeaderName(name)) {
        return {
          success: false,
          error: `Invalid header name: ${name}`,
        };
      }

      if (!HttpValidationService.validateHeaderValue(value)) {
        return {
          success: false,
          error: `Invalid header value for: ${name}`,
        };
      }

      headers.set(name.toLowerCase(), value);
    }

    return {
      success: true,
      data: headers,
    };
  }

  /**
   * Parse query string from path
   */
  static parseQueryString(path: string): {
    path: string;
    query: string | null;
    parameters: Map<string, string>;
  } {
    const queryIndex = path.indexOf('?');
    
    if (queryIndex === -1) {
      return {
        path,
        query: null,
        parameters: new Map(),
      };
    }

    const queryString = path.substring(queryIndex + 1);
    const pathWithoutQuery = path.substring(0, queryIndex);
    const parameters = new Map<string, string>();

    if (queryString) {
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        const [name, value] = pair.split('=');
        if (name) {
          parameters.set(name, value ? decodeURIComponent(value) : '');
        }
      }
    }

    return {
      path: pathWithoutQuery,
      query: queryString,
      parameters,
    };
  }

  /**
   * Build request line from components
   */
  static buildRequestLine(method: HttpMethod, path: string, version: HttpVersion): string {
    return `${method} ${path} ${version}`;
  }

  /**
   * Build status line from components
   */
  static buildStatusLine(version: HttpVersion, statusCode: number, reasonPhrase: string): string {
    return `${version} ${statusCode} ${reasonPhrase}`;
  }

  /**
   * Build headers from map
   */
  static buildHeaders(headers: HttpHeaders): string[] {
    const headerLines: string[] = [];
    headers.forEach((value, key) => {
      headerLines.push(`${key}: ${value}`);
    });
    return headerLines;
  }

  /**
   * Format headers as string
   */
  static formatHeaders(headers: HttpHeaders): string {
    const headerLines = this.buildHeaders(headers);
    return headerLines.join('\r\n') + '\r\n';
  }

  /**
   * Get content type from headers
   */
  static getContentType(headers: HttpHeaders): string | null {
    return headers.get('content-type') || null;
  }

  /**
   * Get content length from headers
   */
  static getContentLength(headers: HttpHeaders): number | null {
    const contentLength = headers.get('content-length');
    if (!contentLength) return null;
    const parsed = parseInt(contentLength, 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Check if connection should be kept alive
   */
  static shouldKeepAlive(headers: HttpHeaders, version: HttpVersion): boolean {
    if (version === HttpVersion.HTTP_1_0) {
      const connection = headers.get('connection');
      return connection?.toLowerCase() === 'keep-alive';
    }
    
    const connection = headers.get('connection');
    if (connection) {
      return connection.toLowerCase() !== 'close';
    }
    
    return true;
  }

  /**
   * Check if transfer encoding is chunked
   */
  static isChunkedEncoding(headers: HttpHeaders): boolean {
    const transferEncoding = headers.get('transfer-encoding');
    return transferEncoding?.toLowerCase().includes('chunked') || false;
  }

  /**
   * Get charset from content type
   */
  static getCharset(contentType: string): string | null {
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    return charsetMatch ? charsetMatch[1].trim() : null;
  }

  /**
   * Get boundary from content type
   */
  static getBoundary(contentType: string): string | null {
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    return boundaryMatch ? boundaryMatch[1].trim() : null;
  }
}
