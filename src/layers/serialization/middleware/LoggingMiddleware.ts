/**
 * Logging Middleware
 * 
 * Middleware that logs data processing in the pipeline.
 */

import { IMiddleware, MiddlewareContext } from './IMiddleware';

export interface ILogger {
  log(message: string): void;
  debug(message: string): void;
  error(message: string): void;
}

export class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[Middleware] ${message}`);
  }

  debug(message: string): void {
    console.debug(`[Middleware Debug] ${message}`);
  }

  error(message: string): void {
    console.error(`[Middleware Error] ${message}`);
  }
}

export class LoggingMiddleware<T = unknown> implements IMiddleware<T> {
  private _name: string;
  private _logger: ILogger;
  private _enabled: boolean;
  private _logData: boolean;

  constructor(name: string = 'logging', logger?: ILogger, logData: boolean = false) {
    this._name = name;
    this._logger = logger ?? new ConsoleLogger();
    this._enabled = true;
    this._logData = logData;
  }

  process(
    context: MiddlewareContext<T>,
    next: (context: MiddlewareContext<T>) => MiddlewareContext<T>
  ): MiddlewareContext<T> {
    if (!this._enabled) {
      return next(context);
    }

    const startTime = Date.now();

    this._logger.debug(
      `Processing ${context.operation} with ${this._name} middleware`
    );

    if (this._logData) {
      this._logger.debug(`Data: ${JSON.stringify(context.data).substring(0, 100)}...`);
    }

    const result = next(context);

    const duration = Date.now() - startTime;

    this._logger.log(
      `Completed ${context.operation} in ${duration}ms with ${this._name} middleware`
    );

    return result;
  }

  getName(): string {
    return this._name;
  }

  /**
   * Enables or disables the middleware
   * 
   * @param enabled - Enable flag
   * @returns This middleware for chaining
   */
  setEnabled(enabled: boolean): LoggingMiddleware<T> {
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

  /**
   * Sets whether to log data content
   * 
   * @param logData - Log data flag
   * @returns This middleware for chaining
   */
  setLogData(logData: boolean): LoggingMiddleware<T> {
    this._logData = logData;
    return this;
  }

  /**
   * Sets the logger
   * 
   * @param logger - New logger
   * @returns This middleware for chaining
   */
  setLogger(logger: ILogger): LoggingMiddleware<T> {
    this._logger = logger;
    return this;
  }
}
