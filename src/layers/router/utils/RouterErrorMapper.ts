/**
 * Router Error Mapper
 */

import { RouterError } from './RouterError';

export interface MappedRouterError {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export class RouterErrorMapper {
  private static readonly _codeToStatus: Record<string, number> = {
    ROUTE_NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    INVALID_ROUTE: 400,
    ROUTE_CONFLICT: 409,
    ROUTE_LIMIT_EXCEEDED: 429,
  };

  static map(error: Error | RouterError): MappedRouterError {
    if (error instanceof RouterError) {
      const statusCode = this._codeToStatus[error.code] ?? 500;
      return {
        code: error.code,
        message: error.message,
        statusCode,
        details: { path: error.path, method: error.method },
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected router error occurred',
      statusCode: 500,
    };
  }

  static registerMapping(code: string, statusCode: number): void {
    this._codeToStatus[code] = statusCode;
  }
}
