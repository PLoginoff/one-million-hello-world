/**
 * Controller Implementation
 * 
 * Concrete implementation of IController.
 * Handles request processing, orchestration, and response generation.
 */

import { IController } from '../interfaces/IController';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ControllerContext,
  ControllerResult,
  HandlerFunction,
  ResponseData,
  HttpStatusCode,
  ControllerError,
} from '../types/controller-types';

export class Controller implements IController {
  private _handlers: Map<string, HandlerFunction>;

  constructor() {
    this._handlers = new Map();
  }

  async handle(
    request: HttpRequest,
    handler: HandlerFunction,
    context: ControllerContext
  ): Promise<ControllerResult> {
    try {
      return await handler(context);
    } catch (error) {
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        HttpStatusCode.INTERNAL_SERVER_ERROR
      );
    }
  }

  createContext(request: HttpRequest, parameters: Record<string, string>): ControllerContext {
    return {
      requestId: request.headers.get('x-request-id') || this._generateId(),
      correlationId: request.headers.get('x-correlation-id') || this._generateId(),
      userId: request.headers.get('x-user-id') || undefined,
      parameters,
      headers: new Map(request.headers),
    };
  }

  createSuccessResponse(body: string, statusCode: number = 200): ControllerResult {
    const response: ResponseData = {
      statusCode: statusCode as HttpStatusCode,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', body.length.toString()],
      ]),
      body: Buffer.from(body),
    };

    return {
      success: true,
      response,
    };
  }

  createErrorResponse(
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ): ControllerResult {
    const error: ControllerError = {
      code: statusCode as HttpStatusCode,
      message,
      details,
    };

    const body = JSON.stringify({ error });
    const response: ResponseData = {
      statusCode: statusCode as HttpStatusCode,
      headers: new Map([
        ['content-type', 'application/json'],
        ['content-length', body.length.toString()],
      ]),
      body: Buffer.from(body),
    };

    return {
      success: false,
      response,
      error,
    };
  }

  registerHandler(operation: string, handler: HandlerFunction): void {
    this._handlers.set(operation, handler);
  }

  getHandler(operation: string): HandlerFunction | undefined {
    return this._handlers.get(operation);
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
