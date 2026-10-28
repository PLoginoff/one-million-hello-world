/**
 * Logging Controller Strategy
 *
 * Decorates a controller strategy with structured logging for each execution.
 * Logs entry, exit, and error events with contextual metadata.
 *
 * @module ControllerLayer/Strategies
 */

import { IControllerStrategy } from './IControllerStrategy';
import { ControllerContext } from '../types/controller-types';
import { ControllerResult } from '../types/controller-types';

/**
 * Logger interface for structured logging.
 */
export interface ILogger {
  /**
   * Logs an informational message.
   *
   * @param message - The log message
   * @param meta - Optional metadata to include
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Logs a warning message.
   *
   * @param message - The log message
   * @param meta - Optional metadata to include
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Logs an error message.
   *
   * @param message - The log message
   * @param meta - Optional metadata to include
   */
  error(message: string, meta?: Record<string, unknown>): void;

  /**
   * Logs a debug message.
   *
   * @param message - The log message
   * @param meta - Optional metadata to include
   */
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Logging controller strategy that wraps another strategy with logging.
 */
export class LoggingControllerStrategy implements IControllerStrategy {
  private readonly _inner: IControllerStrategy;
  private readonly _logger: ILogger;
  private readonly _logPrefix: string;

  /**
   * Creates a new LoggingControllerStrategy instance.
   *
   * @param inner - The strategy to wrap with logging
   * @param logger - The logger instance to use
   * @param logPrefix - Optional prefix for log messages (default: '[ControllerStrategy]')
   */
  constructor(inner: IControllerStrategy, logger: ILogger, logPrefix: string = '[ControllerStrategy]') {
    this._inner = inner;
    this._logger = logger;
    this._logPrefix = logPrefix;
  }

  /**
   * Gets the strategy name, including the wrapped strategy name.
   *
   * @returns The combined strategy name
   */
  getName(): string {
    return `LOGGING(${this._inner.getName()})`;
  }

  /**
   * Gets the strategy priority from the wrapped strategy.
   *
   * @returns The wrapped strategy's priority
   */
  getPriority(): number {
    return this._inner.getPriority();
  }

  /**
   * Executes the wrapped strategy with logging.
   *
   * @param context - The controller execution context
   * @returns Promise resolving to the controller result
   */
  async execute(context: ControllerContext): Promise<ControllerResult> {
    const startTime = Date.now();
    const strategyName = this._inner.getName();

    this._logger.info(`${this._logPrefix} Executing strategy`, {
      strategy: strategyName,
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: context.userId,
    });

    try {
      const result = await this._inner.execute(context);
      const elapsedMs = Date.now() - startTime;

      this._logger.info(`${this._logPrefix} Strategy executed successfully`, {
        strategy: strategyName,
        requestId: context.requestId,
        correlationId: context.correlationId,
        success: result.success,
        elapsedMs,
      });

      return result;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this._logger.error(`${this._logPrefix} Strategy execution failed`, {
        strategy: strategyName,
        requestId: context.requestId,
        correlationId: context.correlationId,
        elapsedMs,
        error: errorMessage,
      });

      throw error;
    }
  }
}
