/**
 * Controller Layer Types
 * 
 * This module defines all type definitions for the Controller Layer,
 * including request handling, orchestration, and response codes.
 */

/**
 * HTTP status codes
 */
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Response data
 */
export interface ResponseData {
  statusCode: HttpStatusCode;
  headers: Map<string, string>;
  body: Buffer;
}

/**
 * Controller context
 */
export interface ControllerContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  parameters: Record<string, string>;
  headers: Map<string, string>;
}

/**
 * Controller result
 */
export interface ControllerResult {
  success: boolean;
  response?: ResponseData;
  error?: ControllerError;
}

/**
 * Controller error
 */
export interface ControllerError {
  code: HttpStatusCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Handler function type
 */
export type HandlerFunction = (context: ControllerContext) => Promise<ControllerResult>;
