/**
 * Middleware Pipeline
 * 
 * Pipeline for processing data through multiple middleware.
 */

import { IMiddleware, MiddlewareContext } from './IMiddleware';

export class MiddlewarePipeline<T = unknown> {
  private _middlewares: IMiddleware<T>[];
  private _enabled: boolean;

  constructor() {
    this._middlewares = [];
    this._enabled = true;
  }

  /**
   * Adds a middleware to the pipeline
   * 
   * @param middleware - Middleware to add
   * @returns This pipeline for chaining
   */
  use(middleware: IMiddleware<T>): MiddlewarePipeline<T> {
    this._middlewares.push(middleware);
    return this;
  }

  /**
   * Adds multiple middlewares to the pipeline
   * 
   * @param middlewares - Array of middlewares to add
   * @returns This pipeline for chaining
   */
  useMultiple(middlewares: IMiddleware<T>[]): MiddlewarePipeline<T> {
    this._middlewares.push(...middlewares);
    return this;
  }

  /**
   * Removes a middleware from the pipeline
   * 
   * @param middleware - Middleware to remove
   * @returns This pipeline for chaining
   */
  remove(middleware: IMiddleware<T>): MiddlewarePipeline<T> {
    const index = this._middlewares.indexOf(middleware);
    if (index > -1) {
      this._middlewares.splice(index, 1);
    }
    return this;
  }

  /**
   * Removes a middleware by name
   * 
   * @param name - Middleware name
   * @returns This pipeline for chaining
   */
  removeByName(name: string): MiddlewarePipeline<T> {
    const index = this._middlewares.findIndex(m => m.getName() === name);
    if (index > -1) {
      this._middlewares.splice(index, 1);
    }
    return this;
  }

  /**
   * Clears all middlewares
   * 
   * @returns This pipeline for chaining
   */
  clear(): MiddlewarePipeline<T> {
    this._middlewares = [];
    return this;
  }

  /**
   * Processes data through the pipeline
   * 
   * @param context - Initial context
   * @returns Final processed context
   */
  async process(context: MiddlewareContext<T>): Promise<MiddlewareContext<T>> {
    if (!this._enabled) {
      return context;
    }

    let currentIndex = 0;

    const next = async (ctx: MiddlewareContext<T>): Promise<MiddlewareContext<T>> => {
      if (currentIndex >= this._middlewares.length) {
        return ctx;
      }

      const middleware = this._middlewares[currentIndex++];
      return middleware.process(ctx, next);
    };

    return next(context);
  }

  /**
   * Processes data synchronously through the pipeline
   * 
   * @param context - Initial context
   * @returns Final processed context
   */
  processSync(context: MiddlewareContext<T>): MiddlewareContext<T> {
    if (!this._enabled) {
      return context;
    }

    let currentContext = context;

    for (const middleware of this._middlewares) {
      currentContext = middleware.process(currentContext, (ctx) => ctx);
    }

    return currentContext;
  }

  /**
   * Gets all middlewares
   * 
   * @returns Array of middlewares
   */
  getMiddlewares(): IMiddleware<T>[] {
    return [...this._middlewares];
  }

  /**
   * Gets the number of middlewares
   * 
   * @returns Number of middlewares
   */
  getMiddlewareCount(): number {
    return this._middlewares.length;
  }

  /**
   * Enables or disables the pipeline
   * 
   * @param enabled - Enable flag
   * @returns This pipeline for chaining
   */
  setEnabled(enabled: boolean): MiddlewarePipeline<T> {
    this._enabled = enabled;
    return this;
  }

  /**
   * Checks if the pipeline is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Inserts a middleware at a specific position
   * 
   * @param index - Position to insert at
   * @param middleware - Middleware to insert
   * @returns This pipeline for chaining
   */
  insertAt(index: number, middleware: IMiddleware<T>): MiddlewarePipeline<T> {
    this._middlewares.splice(index, 0, middleware);
    return this;
  }

  /**
   * Inserts a middleware before another middleware
   * 
   * @param beforeName - Name of middleware to insert before
   * @param middleware - Middleware to insert
   * @returns This pipeline for chaining
   */
  insertBefore(beforeName: string, middleware: IMiddleware<T>): MiddlewarePipeline<T> {
    const index = this._middlewares.findIndex(m => m.getName() === beforeName);
    if (index > -1) {
      this._middlewares.splice(index, 0, middleware);
    } else {
      this._middlewares.push(middleware);
    }
    return this;
  }

  /**
   * Inserts a middleware after another middleware
   * 
   * @param afterName - Name of middleware to insert after
   * @param middleware - Middleware to insert
   * @returns This pipeline for chaining
   */
  insertAfter(afterName: string, middleware: IMiddleware<T>): MiddlewarePipeline<T> {
    const index = this._middlewares.findIndex(m => m.getName() === afterName);
    if (index > -1) {
      this._middlewares.splice(index + 1, 0, middleware);
    } else {
      this._middlewares.push(middleware);
    }
    return this;
  }
}
