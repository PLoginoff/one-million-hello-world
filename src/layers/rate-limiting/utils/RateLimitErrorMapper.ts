/**
 * Rate Limit Error Mapper
 */

import { RateLimitError } from './RateLimitError';

export interface MappedRateLimitError {
  code: string;
  message: string;
  statusCode: number;
  retryAfter?: number;
  headers: Record<string, string>;
}

export class RateLimitErrorMapper {
  static map(error: Error | RateLimitError): MappedRateLimitError {
    if (error instanceof RateLimitError) {
      const headers: Record<string, string> = {};
      if (error.retryAfter !== undefined) {
        headers['Retry-After'] = String(Math.ceil(error.retryAfter / 1000));
      }

      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryAfter: error.retryAfter,
        headers,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected rate limit error occurred',
      statusCode: 500,
      headers: {},
    };
  }

  static toHeaders(error: Error | RateLimitError): Record<string, string> {
    return this.map(error).headers;
  }
}
