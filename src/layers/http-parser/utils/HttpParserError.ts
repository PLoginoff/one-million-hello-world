/**
 * HTTP Parser Error
 * 
 * Custom error class for HTTP parser errors.
 */

import { ParseErrorCode } from '../types/http-parser-types';

export class HttpParserError extends Error {
  readonly code: ParseErrorCode;
  readonly position?: number;

  constructor(code: ParseErrorCode, message: string, position?: number) {
    super(message);
    this.name = 'HttpParserError';
    this.code = code;
    this.position = position;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create invalid method error
   */
  static invalidMethod(method: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.INVALID_METHOD,
      `Invalid HTTP method: ${method}`,
      position
    );
  }

  /**
   * Create invalid version error
   */
  static invalidVersion(version: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.INVALID_VERSION,
      `Invalid HTTP version: ${version}`,
      position
    );
  }

  /**
   * Create invalid header error
   */
  static invalidHeader(header: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.INVALID_HEADER,
      `Invalid header: ${header}`,
      position
    );
  }

  /**
   * Create invalid body error
   */
  static invalidBody(message: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.INVALID_BODY,
      message,
      position
    );
  }

  /**
   * Create malformed request error
   */
  static malformedRequest(message: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.MALFORMED_REQUEST,
      message,
      position
    );
  }

  /**
   * Create incomplete data error
   */
  static incompleteData(message: string, position?: number): HttpParserError {
    return new HttpParserError(
      ParseErrorCode.INCOMPLETE_DATA,
      message,
      position
    );
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: ParseErrorCode;
    message: string;
    position?: number;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      position: this.position,
      stack: this.stack,
    };
  }
}
