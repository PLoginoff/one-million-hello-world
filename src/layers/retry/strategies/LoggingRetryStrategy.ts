/**
 * Logging Retry Strategy
 *
 * Decorator that wraps a retry strategy and adds structured logging
 * for all execution attempts, retries, delays, and results.
 *
 * @module RetryLayer/Strategies
 */

import { IRetryStrategy, RetryContext, RetryStrategyResult } from './IRetryStrategy';
import { RetryConfig } from '../types/retry-types';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry
 */
export interface LogEntry {
  /** Timestamp of the log entry */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Strategy name */
  strategy: string;
  /** Operation being performed */
  operation: string;
  /** Current attempt number */
  attempt: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Additional context data */
  context: Record<string, unknown>;
  /** Duration in milliseconds (for completed operations) */
  durationMs?: number;
  /** Delay before next retry in milliseconds */
  delayMs?: number;
  /** Error message if applicable */
  error?: string;
}

/**
 * Logger interface for structured logging
 */
export interface IStructuredLogger {
  /** Log a debug message */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log an info message */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log a warning message */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log an error message */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements IStructuredLogger {
  private readonly _prefix: string;

  constructor(prefix: string = 'Retry') {
    this._prefix = prefix;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      strategy: this._prefix,
      operation: message,
      attempt: 0,
      maxAttempts: 0,
      context: context ?? {},
    };
    const output = JSON.stringify(entry);
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context);
  }
}

/**
 * Logging decorator for retry strategies
 *
 * Wraps a base strategy and adds structured logging for all operations.
 *
 * @typeParam T - The type of result returned by the operation
 */
export class LoggingRetryStrategy<T = unknown> implements IRetryStrategy<T> {
  readonly name: string;
  readonly priority: number;

  private readonly _wrapped: IRetryStrategy<T>;
  private readonly _logger: IStructuredLogger;
  private readonly _logLevel: LogLevel;

  /**
   * Creates a new LoggingRetryStrategy
   *
   * @param wrapped - The base strategy to wrap
   * @param logger - Optional custom logger (defaults to ConsoleLogger)
   * @param logLevel - Minimum log level (defaults to INFO)
   */
  constructor(wrapped: IRetryStrategy<T>, logger?: IStructuredLogger, logLevel: LogLevel = LogLevel.INFO) {
    this._wrapped = wrapped;
    this._logger =
      logger ?? new ConsoleLogger(`Logging${wrapped.name.charAt(0).toUpperCase() + wrapped.name.slice(1)}Strategy`);
    this._logLevel = logLevel;
    this.name = `logging-${wrapped.name}`;
    this.priority = wrapped.priority;
  }

  /**
   * Executes an operation with retry logic and logging
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: RetryContext<T>): Promise<RetryStrategyResult<T>> {
    const startTime = Date.now();
    const operationName = context.operation.name ?? 'anonymous';

    this.log(LogLevel.INFO, 'Starting retry execution', {
      operation: operationName,
      maxAttempts: context.config.maxAttempts,
      strategy: context.config.strategy,
      baseDelay: context.config.baseDelay,
      idempotent: context.idempotent,
      initialAttempt: context.attempt,
    });

    try {
      const result = await this._wrapped.execute(context);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        this.log(LogLevel.INFO, 'Retry execution succeeded', {
          operation: operationName,
          attempts: result.attempts,
          durationMs,
          delaysMs: result.delaysMs,
        });
      } else {
        this.log(LogLevel.WARN, 'Retry execution failed after all attempts', {
          operation: operationName,
          attempts: result.attempts,
          durationMs,
          delaysMs: result.delaysMs,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log(LogLevel.ERROR, 'Retry execution threw exception', {
        operation: operationName,
        durationMs,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Determines if this strategy can handle the given context
   *
   * @param context - Execution context to evaluate
   * @returns True if strategy can handle the context
   */
  canHandle(context: RetryContext<unknown>): boolean {
    return this._wrapped.canHandle(context);
  }

  /**
   * Calculates the delay before the next retry attempt
   *
   * @param attempt - Current attempt number (1-based)
   * @param config - Retry configuration
   * @param previousError - Previous error if any
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, config: RetryConfig, previousError?: Error): number {
    const delay = this._wrapped.calculateDelay(attempt, config, previousError);

    this.log(LogLevel.DEBUG, 'Calculated retry delay', {
      attempt,
      delayMs: delay,
      strategy: config.strategy,
      baseDelay: config.baseDelay,
      maxDelay: config.maxDelay,
      jitter: config.jitter,
    });

    return delay;
  }

  /**
   * Logs a message at the specified level if it meets the minimum log level
   */
  private log(level: LogLevel, message: string, context: Record<string, unknown>): void {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minLevelIndex = levels.indexOf(this._logLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (messageLevelIndex >= minLevelIndex) {
      this._logger[level](message, {
        ...context,
        strategy: this.name,
      });
    }
  }

  /**
   * Gets the wrapped strategy
   *
   * @returns The wrapped strategy instance
   */
  getWrappedStrategy(): IRetryStrategy<T> {
    return this._wrapped;
  }

  /**
   * Gets the logger instance
   *
   * @returns The logger instance
   */
  getLogger(): IStructuredLogger {
    return this._logger;
  }
}
