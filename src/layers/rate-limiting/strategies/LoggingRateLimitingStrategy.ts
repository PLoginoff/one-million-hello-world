/**
 * Rate Limiting Logging Strategy
 *
 * Adds structured logging to rate limiting operations by wrapping a base strategy.
 * Provides configurable request/response/error logging with metadata.
 *
 * @module RateLimitingLayer/Strategies
 */

import { IRateLimitingStrategy, RateLimitingStrategyContext, StrategyResult } from './IRateLimitingStrategy';
import { RateLimitingErrorFactory } from '../errors';

/**
 * Configuration options for the logging strategy.
 */
export interface LoggingRateLimitingStrategyOptions {
  /** Minimum log level to output */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** Whether to log incoming requests */
  logRequests: boolean;
  /** Whether to log successful responses */
  logResponses: boolean;
  /** Whether to log errors */
  logErrors: boolean;
  /** Whether to include metadata in logs */
  includeMetadata: boolean;
  /** Custom logger implementation */
  logger?: RateLimitingLogger;
}

/**
 * Logger interface for structured logging.
 */
export interface RateLimitingLogger {
  /** Log debug message */
  debug(message: string, meta?: Record<string, unknown>): void;
  /** Log info message */
  info(message: string, meta?: Record<string, unknown>): void;
  /** Log warning message */
  warn(message: string, meta?: Record<string, unknown>): void;
  /** Log error message */
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_OPTIONS: LoggingRateLimitingStrategyOptions = {
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  logErrors: true,
  includeMetadata: true,
};

/**
 * Logging rate limiting strategy that wraps a base strategy and adds structured logging.
 */
export class LoggingRateLimitingStrategy implements IRateLimitingStrategy {
  /** Unique name identifying this strategy */
  readonly name = 'logging-rate-limiting';

  /** Priority for strategy selection (higher = preferred) */
  readonly priority = 5;

  private readonly options: LoggingRateLimitingStrategyOptions;
  private readonly wrappedStrategy: IRateLimitingStrategy;
  private executionCount: number;

  /**
   * Creates a new LoggingRateLimitingStrategy instance.
   *
   * @param wrappedStrategy - The base strategy to wrap with logging
   * @param options - Optional configuration options
   */
  constructor(wrappedStrategy: IRateLimitingStrategy, options: Partial<LoggingRateLimitingStrategyOptions> = {}) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.executionCount = 0;

    // Default console logger if none provided
    if (!this.options.logger) {
      this.options.logger = {
        debug: (msg, meta) => console.debug(`[RATE-LIMIT][DEBUG] ${msg}`, meta ?? ''),
        info: (msg, meta) => console.info(`[RATE-LIMIT][INFO] ${msg}`, meta ?? ''),
        warn: (msg, meta) => console.warn(`[RATE-LIMIT][WARN] ${msg}`, meta ?? ''),
        error: (msg, meta) => console.error(`[RATE-LIMIT][ERROR] ${msg}`, meta ?? ''),
      };
    }
  }

  /**
   * Determines if the wrapped strategy can handle the given context.
   *
   * @param context - The strategy context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: RateLimitingStrategyContext): boolean {
    return this.wrappedStrategy.canHandle(context);
  }

  /**
   * Executes the wrapped strategy with logging.
   *
   * @param context - The strategy context containing input and metadata
   * @returns Promise resolving to the strategy result
   * @throws RateLimitingError if execution fails
   */
  async execute(context: RateLimitingStrategyContext): Promise<StrategyResult> {
    this.executionCount++;
    const startTime = Date.now();
    const executionId = `rl-${this.executionCount}-${startTime}`;

    // Log request
    if (this.options.logRequests) {
      this.logRequest(executionId, context);
    }

    try {
      const result = await this.wrappedStrategy.execute(context);
      const duration = Date.now() - startTime;

      // Log response
      if (this.options.logResponses) {
        this.logResponse(executionId, result, duration);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      if (this.options.logErrors) {
        this.logError(executionId, error as Error, duration);
      }

      // Re-throw as rate limiting error
      throw RateLimitingErrorFactory.execution(
        `Logging strategy execution failed: ${(error as Error).message}`,
        { operation: 'execute', metadata: { executionId, duration } },
        error as Error
      );
    }
  }

  /**
   * Logs the incoming request.
   *
   * @param executionId - Unique execution identifier
   * @param context - The strategy context
   */
  private logRequest(executionId: string, context: RateLimitingStrategyContext): void {
    const meta: Record<string, unknown> = {
      executionId,
      strategy: this.wrappedStrategy.name,
      timestamp: Date.now(),
    };

    if (this.options.includeMetadata && context.input !== null && context.input !== undefined) {
      meta.inputType = typeof context.input;
      meta.inputKeys = context.input && typeof context.input === 'object' ? Object.keys(context.input) : [];
      if (context.metadata) {
        meta.metadataKeys = Object.keys(context.metadata);
      }
      if (context.correlationId) {
        meta.correlationId = context.correlationId;
      }
    }

    this.options.logger!.info('Rate limit request received', meta);
  }

  /**
   * Logs the response.
   *
   * @param executionId - Unique execution identifier
   * @param result - The strategy result
   * @param duration - Execution duration in milliseconds
   */
  private logResponse(executionId: string, result: StrategyResult, duration: number): void {
    const meta: Record<string, unknown> = {
      executionId,
      strategy: this.wrappedStrategy.name,
      duration,
      success: result.success,
      timestamp: Date.now(),
    };

    if (this.options.includeMetadata) {
      if (result.data) {
        meta.hasData = true;
        meta.dataType = typeof result.data;
      }
      if (result.error) {
        meta.errorCode = result.error.code;
        meta.errorMessage = result.error.message;
      }
    }

    if (result.success) {
      this.options.logger!.info('Rate limit request completed', meta);
    } else {
      this.options.logger!.warn('Rate limit request failed', meta);
    }
  }

  /**
   * Logs an error.
   *
   * @param executionId - Unique execution identifier
   * @param error - The error that occurred
   * @param duration - Execution duration in milliseconds
   */
  private logError(executionId: string, error: Error, duration: number): void {
    const meta: Record<string, unknown> = {
      executionId,
      strategy: this.wrappedStrategy.name,
      duration,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: Date.now(),
    };

    this.options.logger!.error('Rate limit request error', meta);
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Gets the wrapped strategy.
   *
   * @returns The wrapped strategy instance
   */
  getWrappedStrategy(): IRateLimitingStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Sets a custom logger.
   *
   * @param logger - The logger to use
   */
  setLogger(logger: RateLimitingLogger): void {
    this.options.logger = logger;
  }

  /**
   * Sets the log level.
   *
   * @param level - The log level to set
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.options.logLevel = level;
  }
}

/**
 * Factory for creating logging strategy instances.
 */
export class LoggingRateLimitingStrategyFactory {
  /**
   * Creates a new logging strategy with the given wrapped strategy and options.
   *
   * @param wrappedStrategy - The base strategy to wrap
   * @param options - Optional configuration options
   * @returns A new LoggingRateLimitingStrategy instance
   */
  static create(
    wrappedStrategy: IRateLimitingStrategy,
    options?: Partial<LoggingRateLimitingStrategyOptions>
  ): LoggingRateLimitingStrategy {
    return new LoggingRateLimitingStrategy(wrappedStrategy, options);
  }

  /**
   * Creates a new logging strategy with default logger and specified log level.
   *
   * @param wrappedStrategy - The base strategy to wrap
   * @param logLevel - The log level to use
   * @returns A new LoggingRateLimitingStrategy instance
   */
  static createWithDefaultLogger(
    wrappedStrategy: IRateLimitingStrategy,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): LoggingRateLimitingStrategy {
    return new LoggingRateLimitingStrategy(wrappedStrategy, { logLevel });
  }
}
