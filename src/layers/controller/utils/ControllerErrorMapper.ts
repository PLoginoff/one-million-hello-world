/**
 * Controller Error Mapper
 *
 * Maps internal controller errors to HTTP-appropriate error responses.
 */

import { ControllerError } from './ControllerError';
import { ControllerResult, HttpStatusCode } from '../types/controller-types';

export interface MappedError {
  statusCode: HttpStatusCode;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ControllerErrorMapper {
  private static readonly _codeToStatus: Record<string, HttpStatusCode> = {
    CONTROLLER_NOT_FOUND: HttpStatusCode.NOT_FOUND,
    CONTROLLER_ALREADY_REGISTERED: HttpStatusCode.CONFLICT,
    CONTROLLER_INSTANTIATION_FAILED: HttpStatusCode.INTERNAL_SERVER_ERROR,
    CONTROLLER_DISABLED: HttpStatusCode.SERVICE_UNAVAILABLE,
    CONTROLLER_TIMEOUT: HttpStatusCode.SERVICE_UNAVAILABLE,
    CONTROLLER_VALIDATION_FAILED: HttpStatusCode.BAD_REQUEST,
    CONTROLLER_UNAUTHORIZED: HttpStatusCode.UNAUTHORIZED,
    CONTROLLER_FORBIDDEN: HttpStatusCode.FORBIDDEN,
    CONTROLLER_METHOD_NOT_ALLOWED: HttpStatusCode.METHOD_NOT_ALLOWED,
  };

  static map(error: Error | ControllerError): MappedError {
    if (error instanceof ControllerError) {
      const statusCode = this._codeToStatus[error.code] ?? HttpStatusCode.INTERNAL_SERVER_ERROR;
      return {
        statusCode,
        code: error.code,
        message: error.message,
        details: error.controllerId !== undefined ? { controllerId: error.controllerId } : undefined,
      };
    }

    return {
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
    };
  }

  static toControllerResult(error: Error | ControllerError): ControllerResult {
    const mapped = this.map(error);
    return {
      success: false,
      error: {
        code: mapped.statusCode,
        message: mapped.message,
        details: mapped.details,
      },
    };
  }

  static registerMapping(code: string, statusCode: HttpStatusCode): void {
    this._codeToStatus[code] = statusCode;
  }
}
