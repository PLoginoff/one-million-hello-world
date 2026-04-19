/**
 * Transformation Middleware
 * 
 * Middleware that transforms data in the pipeline.
 */

import { IMiddleware, MiddlewareContext } from './IMiddleware';

export type TransformFunction<T = unknown> = (data: T) => T;

export class TransformationMiddleware<T = unknown> implements IMiddleware<T> {
  private _name: string;
  private _transform: TransformFunction<T>;
  private _enabled: boolean;

  constructor(name: string, transform: TransformFunction<T>) {
    this._name = name;
    this._transform = transform;
    this._enabled = true;
  }

  process(
    context: MiddlewareContext<T>,
    next: (context: MiddlewareContext<T>) => MiddlewareContext<T>
  ): MiddlewareContext<T> {
    if (!this._enabled) {
      return next(context);
    }

    try {
      context.data = this._transform(context.data);
    } catch (error) {
      context.metadata = context.metadata ?? {};
      context.metadata.transformationError = error instanceof Error ? error.message : String(error);
      context.metadata.transformationFailed = true;
    }

    return next(context);
  }

  getName(): string {
    return this._name;
  }

  /**
   * Sets the transform function
   * 
   * @param transform - New transform function
   * @returns This middleware for chaining
   */
  setTransform(transform: TransformFunction<T>): TransformationMiddleware<T> {
    this._transform = transform;
    return this;
  }

  /**
   * Enables or disables the middleware
   * 
   * @param enabled - Enable flag
   * @returns This middleware for chaining
   */
  setEnabled(enabled: boolean): TransformationMiddleware<T> {
    this._enabled = enabled;
    return this;
  }

  /**
   * Checks if the middleware is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }
}
