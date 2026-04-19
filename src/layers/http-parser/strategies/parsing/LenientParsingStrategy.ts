/**
 * Lenient Parsing Strategy
 * 
 * Tolerant parsing that handles malformed HTTP gracefully.
 */

import { IParsingStrategy } from './IParsingStrategy';
import { ParserConfigOptions } from '../../configuration/defaults/DefaultConfigs';
import { HttpValidationService } from '../../domain/services/HttpValidationService';

export class LenientParsingStrategy implements IParsingStrategy {
  getName(): string {
    return 'LENIENT';
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
      const requestLineParts = requestLine.trim().split(/\s+/);

      if (requestLineParts.length < 2) {
        return {
          success: false,
          error: 'Invalid request line format',
        };
      }

      const method = requestLineParts[0];
      let path = requestLineParts[1];
      const version = requestLineParts[2] || 'HTTP/1.1';

      if (!HttpValidationService.validateMethod(method)) {
        return {
          success: false,
          error: `Invalid HTTP method: ${method}`,
        };
      }

      const emptyLineIndex = lines.indexOf('');
      const headerLines = emptyLineIndex === -1 ? lines.slice(1) : lines.slice(1, emptyLineIndex);
      const headers = new Map();

      for (const line of headerLines) {
        if (!line.trim()) continue;

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
          continue;
        }

        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        headers.set(name.toLowerCase(), value);
      }

      const bodyStart = emptyLineIndex === -1 ? headerLines.length + 1 : emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

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
      const statusLineParts = statusLine.trim().split(/\s+/);

      if (statusLineParts.length < 2) {
        return {
          success: false,
          error: 'Invalid status line format',
        };
      }

      const version = statusLineParts[0];
      const statusCode = statusLineParts[1];
      const reasonPhrase = statusLineParts.slice(2).join(' ') || 'OK';

      const emptyLineIndex = lines.indexOf('');
      const headerLines = emptyLineIndex === -1 ? lines.slice(1) : lines.slice(1, emptyLineIndex);
      const headers = new Map();

      for (const line of headerLines) {
        if (!line.trim()) continue;

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
          continue;
        }

        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        headers.set(name.toLowerCase(), value);
      }

      const bodyStart = emptyLineIndex === -1 ? headerLines.length + 1 : emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

      return {
        success: true,
        data: {
          line: { version, statusCode: parseInt(statusCode, 10), reasonPhrase },
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
