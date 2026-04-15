/**
 * Controller Interface
 * 
 * Defines the contract for controller operations
 * including request handling, orchestration, and response codes.
 */

import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  ControllerContext,
  ControllerResult,
  HandlerFunction,
} from '../types/controller-types';

/**
 * Interface for controller operations
 */
export interface IController {
  /**
   * Handles a request with the given handler
   * 
   * @param request - HTTP request to handle
   * @param handler - Handler function to execute
   * @param context - Controller context
   * @returns Controller result
   */
  handle(request: HttpRequest, handler: HandlerFunction, context: ControllerContext): Promise<ControllerResult>;

  /**
   * Creates a controller context from request data
   * 
   * @param request - HTTP request
   * @param parameters - Route parameters
   * @returns Controller context
   */
  createContext(request: HttpRequest, parameters: Record<string, string>): ControllerContext;

  /**
   * Creates a successful response
   * 
   * @param body - Response body
   * @param statusCode - HTTP status code
   * @returns Controller result with success
   */
  createSuccessResponse(body: string, statusCode?: number): ControllerResult;

  /**
   * Creates an error response
   * 
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param details - Additional error details
   * @returns Controller result with error
   */
  createErrorResponse(message: string, statusCode?: number, details?: Record<string, unknown>): ControllerResult;

  /**
   * Registers a handler for a specific operation
   * 
   * @param operation - Operation name
   * @param handler - Handler function
   */
  registerHandler(operation: string, handler: HandlerFunction): void;

  /**
   * Gets a registered handler
   * 
   * @param operation - Operation name
   * @returns Handler function or undefined
   */
  getHandler(operation: string): HandlerFunction | undefined;
}
