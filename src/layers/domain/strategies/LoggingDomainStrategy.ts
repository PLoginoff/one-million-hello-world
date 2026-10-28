/**
 * Logging Domain Strategy
 *
 * Decorates a domain strategy with structured logging for each execution.
 * Logs entry, exit, and error events with contextual metadata.
 *
 * @module DomainLayer/Strategies
 */

import { IDomainStrategy } from './IDomainStrategy';
import { DomainContext } from '../types/domain-types';
import { DomainResult } from '../types/domain-types';

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
 * Logging domain strategy that wraps another strategy with logging.
 */
export class LoggingDomainStrategy<TInput = unknown, TOutput = unknown> implements IDomainStrategy<TInput, TOutput> {
  private readonly _inner: IDomainStrategy<TInput, TOutput>;
  private readonly _logger: ILogger;
  private readonly _logPrefix: string;

  /**
   * Creates a new LoggingDomainStrategy instance.
   *
   * @param inner - The strategy to wrap with logging
   * @param logger - The logger instance to use
   * @param logPrefix - Optional prefix for log messages (default: '[DomainStrategy]')
   */
  constructor(inner: IDomainStrategy<TInput, TOutput>, logger: ILogger, logPrefix: string = '[DomainStrategy]') {
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
   * @param input - The input data for the domain operation
   * @param context - The domain execution context
   * @returns Promise resolving to the domain result
   */
  async execute(input: TInput, context: DomainContext): Promise<DomainResult<TOutput>> {
    const startTime = Date.now();
    const strategyName = this._inner.getName();

    this._logger.info(`${this._logPrefix} Executing strategy`, {
      strategy: strategyName,
      correlationId: context.correlationId,
      causationId: context.causationId,
      userId: context.userId,
      timestamp: context.timestamp.toISOString(),
    });

    try {
      const result = await this._inner.execute(input, context);
      const elapsedMs = Date.now() - startTime;

      this._logger.info(`${this._logPrefix} Strategy executed successfully`, {
        strategy: strategyName,
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
        correlationId: context.correlationId,
        elapsedMs,
        error: errorMessage,
      });

      throw error;
    }
  }
}
