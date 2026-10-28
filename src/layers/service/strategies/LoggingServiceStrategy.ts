/**
 * Logging Service Strategy
 *
 * Decorates a service strategy with structured logging for each execution.
 * Logs entry, exit, and error events with contextual metadata.
 *
 * @module ServiceLayer/Strategies
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceContext } from '../types/service-types';
import { ServiceResult } from '../types/service-types';

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
 * Logging service strategy that wraps another strategy with logging.
 */
export class LoggingServiceStrategy<TInput = unknown, TOutput = unknown> implements IServiceStrategy<TInput, TOutput> {
  private readonly _inner: IServiceStrategy<TInput, TOutput>;
  private readonly _logger: ILogger;
  private readonly _logPrefix: string;

  /**
   * Creates a new LoggingServiceStrategy instance.
   *
   * @param inner - The strategy to wrap with logging
   * @param logger - The logger instance to use
   * @param logPrefix - Optional prefix for log messages (default: '[ServiceStrategy]')
   */
  constructor(inner: IServiceStrategy<TInput, TOutput>, logger: ILogger, logPrefix: string = '[ServiceStrategy]') {
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
   * @param input - The input data for the service operation
   * @param context - The service execution context
   * @returns Promise resolving to the service result
   */
  async execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>> {
    const startTime = Date.now();
    const strategyName = this._inner.getName();

    this._logger.info(`${this._logPrefix} Executing strategy`, {
      strategy: strategyName,
      requestId: context.requestId,
      correlationId: context.correlationId,
      userId: context.userId,
      timestamp: context.timestamp.toISOString(),
    });

    try {
      const result = await this._inner.execute(input, context);
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
