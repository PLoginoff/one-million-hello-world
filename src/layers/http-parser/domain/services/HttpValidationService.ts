/**
 * HTTP Validation Service
 * 
 * Provides validation logic for HTTP requests, responses, and components.
 */

import { HttpRequest, HttpResponse, HttpMethod, HttpVersion } from '../../types/http-parser-types';
import { ValidationRules } from '../../types/http-parser-types';

export class HttpValidationService {
  /**
   * Validate HTTP request
   */
  static validateRequest(request: HttpRequest, rules?: ValidationRules): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!request.line) {
      errors.push('Request line is missing');
      return { valid: false, errors };
    }

    if (!request.line.method || !request.line.path || !request.line.version) {
      errors.push('Request line is incomplete');
    }

    if (!Object.values(HttpMethod).includes(request.line.method)) {
      errors.push(`Invalid HTTP method: ${request.line.method}`);
    }

    if (!Object.values(HttpVersion).includes(request.line.version)) {
      errors.push(`Invalid HTTP version: ${request.line.version}`);
    }

    if (request.line.path.length > 2048) {
      errors.push('Path length exceeds maximum of 2048 characters');
    }

    if (!request.headers) {
      errors.push('Headers are missing');
    }

    if (request.headers.size > 100) {
      errors.push('Header count exceeds maximum of 100');
    }

    request.headers.forEach((value, key) => {
      if (key.length > 128) {
        errors.push(`Header name length exceeds maximum of 128: ${key}`);
      }
      if (value.length > 8192) {
        errors.push(`Header value length exceeds maximum of 8192: ${key}`);
      }
    });

    if (request.body.length > 10485760) {
      errors.push('Body size exceeds maximum of 10MB');
    }

    if (rules) {
      const customErrors = this.validateWithRules(request, rules);
      errors.push(...customErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate HTTP response
   */
  static validateResponse(response: HttpResponse): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!response.line) {
      errors.push('Status line is missing');
      return { valid: false, errors };
    }

    if (!response.line.version || !response.line.statusCode) {
      errors.push('Status line is incomplete');
    }

    if (!Object.values(HttpVersion).includes(response.line.version)) {
      errors.push(`Invalid HTTP version: ${response.line.version}`);
    }

    if (response.line.statusCode < 100 || response.line.statusCode > 599) {
      errors.push(`Invalid status code: ${response.line.statusCode}`);
    }

    if (!response.headers) {
      errors.push('Headers are missing');
    }

    if (response.headers.size > 100) {
      errors.push('Header count exceeds maximum of 100');
    }

    response.headers.forEach((value, key) => {
      if (key.length > 128) {
        errors.push(`Header name length exceeds maximum of 128: ${key}`);
      }
      if (value.length > 8192) {
        errors.push(`Header value length exceeds maximum of 8192: ${key}`);
      }
    });

    if (response.body.length > 10485760) {
      errors.push('Body size exceeds maximum of 10MB');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate HTTP method
   */
  static validateMethod(method: string): boolean {
    return Object.values(HttpMethod).includes(method as HttpMethod);
  }

  /**
   * Validate HTTP version
   */
  static validateVersion(version: string): boolean {
    return Object.values(HttpVersion).includes(version as HttpVersion);
  }

  /**
   * Validate header name
   */
  static validateHeaderName(name: string): boolean {
    if (!name || name.length === 0) {
      return false;
    }
    if (name.length > 128) {
      return false;
    }
    const invalidChars = /[\x00-\x1F\x7F()<>@,;:\\"[\]{}]/;
    return !invalidChars.test(name);
  }

  /**
   * Validate header value
   */
  static validateHeaderValue(value: string): boolean {
    if (value.length > 8192) {
      return false;
    }
    const invalidChars = /[\x00-\x08\x0A-\x1F\x7F]/;
    return !invalidChars.test(value);
  }

  /**
   * Validate content type
   */
  static validateContentType(contentType: string): boolean {
    const contentTypeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_+.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_+.]*$/;
    return contentTypeRegex.test(contentType);
  }

  /**
   * Validate URL
   */
  static validateUrl(url: string): boolean {
    if (url.length > 2048) {
      return false;
    }
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate path
   */
  static validatePath(path: string): boolean {
    if (path.length > 2048) {
      return false;
    }
    const pathRegex = /^\/[^\s]*$/;
    return pathRegex.test(path);
  }

  /**
   * Validate query string
   */
  static validateQueryString(queryString: string): boolean {
    if (queryString.length > 2048) {
      return false;
    }
    const queryRegex = /^[^\s#]*$/;
    return queryRegex.test(queryString);
  }

  /**
   * Validate status code
   */
  static validateStatusCode(statusCode: number): boolean {
    return statusCode >= 100 && statusCode <= 599;
  }

  /**
   * Validate with custom rules
   */
  private static validateWithRules(request: HttpRequest, rules: ValidationRules): string[] {
    const errors: string[] = [];

    for (const requiredHeader of rules.requiredHeaders) {
      if (!request.headers.has(requiredHeader.toLowerCase())) {
        errors.push(`Required header is missing: ${requiredHeader}`);
      }
    }

    for (const forbiddenHeader of rules.forbiddenHeaders) {
      if (request.headers.has(forbiddenHeader.toLowerCase())) {
        errors.push(`Forbidden header is present: ${forbiddenHeader}`);
      }
    }

    request.headers.forEach((value, key) => {
      if (key.length > rules.maxHeaderNameLength) {
        errors.push(`Header name exceeds maximum length: ${key}`);
      }
      if (value.length > rules.maxHeaderValueLength) {
        errors.push(`Header value exceeds maximum length: ${key}`);
      }
    });

    if (!rules.allowEmptyBody && request.body.length === 0) {
      const method = request.line.method;
      if (method === HttpMethod.POST || method === HttpMethod.PUT || method === HttpMethod.PATCH) {
        errors.push('Body cannot be empty for this method');
      }
    }

    if (rules.validateContentType) {
      const contentType = request.headers.get('content-type');
      if (!contentType) {
        errors.push('Content-Type header is required');
      } else if (!this.validateContentType(contentType)) {
        errors.push('Invalid Content-Type header');
      }
    }

    if (rules.validateContentLength) {
      const contentLength = request.headers.get('content-length');
      if (!contentLength) {
        errors.push('Content-Length header is required');
      } else {
        const length = parseInt(contentLength, 10);
        if (isNaN(length) || length !== request.body.length) {
          errors.push('Content-Length does not match actual body size');
        }
      }
    }

    if (rules.validateHost) {
      const host = request.headers.get('host');
      if (!host) {
        errors.push('Host header is required');
      }
    }

    if (rules.validateUserAgent) {
      const userAgent = request.headers.get('user-agent');
      if (!userAgent) {
        errors.push('User-Agent header is required');
      }
    }

    return errors;
  }
}
