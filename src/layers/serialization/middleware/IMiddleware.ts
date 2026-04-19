/**
 * Middleware Interface
 * 
 * Defines the contract for middleware in the serialization pipeline.
 */

export interface MiddlewareContext<T = unknown> {
  data: T;
  operation: 'serialize' | 'deserialize';
  metadata?: Record<string, unknown>;
}

export interface IMiddleware<T = unknown> {
  /**
   * Processes data in the middleware pipeline
   * 
   * @param context - Middleware context
   * @param next - Next middleware function
   * @returns Processed context
   */
  process(context: MiddlewareContext<T>, next: (context: MiddlewareContext<T>) => MiddlewareContext<T>): MiddlewareContext<T>;

  /**
   * Gets the middleware name
   * 
   * @returns Middleware name
   */
  getName(): string;
}
