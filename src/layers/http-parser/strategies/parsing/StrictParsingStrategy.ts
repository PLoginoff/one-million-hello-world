/**
 * Strict Parsing Strategy
 * 
 * Enforces strict HTTP protocol compliance.
 */

import { IParsingStrategy } from './IParsingStrategy';
import { ParserConfigOptions } from '../../configuration/defaults/DefaultConfigs';
import { HttpValidationService } from '../../domain/services/HttpValidationService';

export class StrictParsingStrategy implements IParsingStrategy {
  getName(): string {
    return 'STRICT';
  }

  parseRequest(raw: any, config: ParserConfigOptions): {
    success: boolean;
    data?: any;
    error?: string;
  } {
    try {
      const rawString = raw.toString('utf-8');
      const lines = rawString.split('\r\n');

      if (lines.length < 1) {
        return {
          success: false,
          error: 'Empty request',
        };
      }

      const requestLine = lines[0];
      const requestLineParts = requestLine.split(' ');

      if (requestLineParts.length !== 3) {
        return {
          success: false,
          error: 'Invalid request line format',
        };
      }

      const [method, path, version] = requestLineParts;

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

      const emptyLineIndex = lines.indexOf('');
      if (emptyLineIndex === -1) {
        return {
          success: false,
          error: 'Missing empty line between headers and body',
        };
      }

      const headerLines = lines.slice(1, emptyLineIndex);
      const headers = new Map();

      for (const line of headerLines) {
        if (!line.trim()) continue;

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

      if (headers.size > config.maxHeaderCount) {
        return {
          success: false,
          error: `Header count exceeds maximum of ${config.maxHeaderCount}`,
        };
      }

      const bodyStart = emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

      if (body.length > config.maxBodySize) {
        return {
          success: false,
          error: `Body size exceeds maximum of ${config.maxBodySize}`,
        };
      }

      return {
        success: true,
        data: {
          line: { method, path, version, query: undefined },
          headers,
          body,
          raw,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  parseResponse(raw: any, config: ParserConfigOptions): {
    success: boolean;
    data?: any;
    error?: string;
  } {
    try {
      const rawString = raw.toString('utf-8');
      const lines = rawString.split('\r\n');

      if (lines.length < 1) {
        return {
          success: false,
          error: 'Empty response',
        };
      }

      const statusLine = lines[0];
      const statusLineParts = statusLine.split(' ');

      if (statusLineParts.length < 2) {
        return {
          success: false,
          error: 'Invalid status line format',
        };
      }

      const [version, statusCode, ...reasonParts] = statusLineParts;
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

      const emptyLineIndex = lines.indexOf('');
      if (emptyLineIndex === -1) {
        return {
          success: false,
          error: 'Missing empty line between headers and body',
        };
      }

      const headerLines = lines.slice(1, emptyLineIndex);
      const headers = new Map();

      for (const line of headerLines) {
        if (!line.trim()) continue;

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

      const bodyStart = emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

      return {
        success: true,
        data: {
          line: { version, statusCode: statusCodeNum, reasonPhrase },
          headers,
          body,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  reset(): void {
  }
}
