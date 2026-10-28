/**
 * Logging Middleware Strategy
 *
 * Decorator that wraps a middleware strategy and adds structured logging
 * for all middleware pipeline operations.
 *
 * @module MiddlewareLayer/Strategies
 */

import { IMiddlewareStrategy, MiddlewareStrategyContext, MiddlewareStrategyResult } from './IMiddlewareStrategy';

/**
 * Log levels for structured logging.
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry for middleware operations.
 */
export interface MiddlewareLogEntry {
  /** Timestamp of the log entry */
  readonly timestamp: number;
  /** Log level */
  readonly level: LogLevel;
  /** Strategy name that generated the log */
  readonly strategyName: string;
  /** Operation being logged */
  readonly operation: 'execute' | 'canHandle' | 'stage';
  /** Middleware context (sanitized) */
  readonly context: {
    readonly method: string;
    readonly path: string;
    readonly correlationId: string;
    readonly traceId: string;
    readonly hasBody: boolean;
    readonly headerCount: number;
  };
  /** Stage-specific information (for stage operations) */
  readonly stage?: {
    readonly name: string;
    readonly type: string;
    readonly order: number;
  };
  /** Result of the operation (for execute) */
  readonly result?: {
    readonly success: boolean;
    readonly executionTimeMs: number;
    readonly stagesExecuted?: number;
    readonly stagesSkipped?: number;
    readonly errorCode?: string;
    readonly statusCode?: number;
  };
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface IMiddlewareLogger {
  /** Log a debug message */
  debug(entry: MiddlewareLogEntry): void;
  /** Log an info message */
  info(entry: MiddlewareLogEntry): void;
  /** Log a warning message */
  warn(entry: MiddlewareLogEntry): void;
  /** Log an error message */
  error(entry: MiddlewareLogEntry): void;
}

/**
 * Default console logger implementation.
 */
export class ConsoleMiddlewareLogger implements IMiddlewareLogger {
  private readonly minLevel: LogLevel;

  private static readonly levelOrder: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return ConsoleMiddlewareLogger.levelOrder[level] >= ConsoleMiddlewareLogger.levelOrder[this.minLevel];
  }

  private log(level: LogLevel, entry: MiddlewareLogEntry): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const logMethod = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : console.log;
    logMethod(JSON.stringify({ ...entry, level }));
  }

  debug(entry: MiddlewareLogEntry): void {
    this.log(LogLevel.DEBUG, entry);
  }

  info(entry: MiddlewareLogEntry): void {
    this.log(LogLevel.INFO, entry);
  }

  warn(entry: MiddlewareLogEntry): void {
    this.log(LogLevel.WARN, entry);
  }

  error(entry: MiddlewareLogEntry): void {
    this.log(LogLevel.ERROR, entry);
  }
}

/**
 * Logging middleware strategy decorator.
 *
 * Wraps an existing middleware strategy and adds structured logging
 * for all pipeline operations without modifying the core logic.
 */
export class LoggingMiddlewareStrategy implements IMiddlewareStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IMiddlewareStrategy;
  private readonly logger: IMiddlewareLogger;
  private readonly logStages: boolean;

  /**
   * Create a new LoggingMiddlewareStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with logging
   * @param logger - Optional custom logger (defaults to console logger)
   * @param logStages - Whether to log individual stage execution (default: false)
   */
  constructor(wrappedStrategy: IMiddlewareStrategy, logger?: IMiddlewareLogger, logStages: boolean = false) {
    this.wrappedStrategy = wrappedStrategy;
    this.logger = logger ?? new ConsoleMiddlewareLogger();
    this.logStages = logStages;
    this.name = `logging-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The middleware context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: MiddlewareStrategyContext): boolean {
    const result = this.wrappedStrategy.canHandle(context);

    this.logger.debug({
      timestamp: Date.now(),
      level: LogLevel.DEBUG,
      strategyName: this.name,
      operation: 'canHandle',
      context: this.sanitizeContext(context),
      result: {
        success: result,
        executionTimeMs: 0,
      },
    });

    return result;
  }

  /**
   * Execute the wrapped strategy with logging.
   *
   * @param context - The middleware context
   * @returns Promise resolving to the middleware result
   */
  async execute(context: MiddlewareStrategyContext): Promise<MiddlewareStrategyResult> {
    const startTime = Date.now();

    this.logger.info({
      timestamp: startTime,
      level: LogLevel.INFO,
      strategyName: this.name,
      operation: 'execute',
      context: this.sanitizeContext(context),
    });

    try {
      // If we want to log stages, we need to intercept the wrapped strategy
      // For now, we log the overall execution
      const result = await this.wrappedStrategy.execute(context);
      const executionTimeMs = Date.now() - startTime;

      if (result.success) {
        this.logger.info({
          timestamp: Date.now(),
          level: LogLevel.INFO,
          strategyName: this.name,
          operation: 'execute',
          context: this.sanitizeContext(context),
          result: {
            success: true,
            executionTimeMs,
            stagesExecuted: result.metadata?.stagesExecuted,
            stagesSkipped: result.metadata?.stagesSkipped,
            statusCode: result.statusCode,
          },
        });
      } else {
        this.logger.warn({
          timestamp: Date.now(),
          level: LogLevel.WARN,
          strategyName: this.name,
          operation: 'execute',
          context: this.sanitizeContext(context),
          result: {
            success: false,
            executionTimeMs,
            stagesExecuted: result.metadata?.stagesExecuted,
            stagesSkipped: result.metadata?.stagesSkipped,
            errorCode: result.error?.code,
            statusCode: result.statusCode,
          },
        });
      }

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        strategyName: this.name,
        operation: 'execute',
        context: this.sanitizeContext(context),
        result: {
          success: false,
          executionTimeMs,
          errorCode: 'EXECUTION_ERROR',
        },
        metadata: {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      throw error;
    }
  }

  /**
   * Sanitize context for logging (remove sensitive data).
   *
   * @param context - The middleware context
   * @returns Sanitized context safe for logging
   */
  private sanitizeContext(context: MiddlewareStrategyContext): MiddlewareLogEntry['context'] {
    return {
      method: context.method,
      path: context.path,
      correlationId: context.correlationContext.correlationId,
      traceId: context.correlationContext.traceId,
      hasBody: context.body !== undefined,
      headerCount: Object.keys(context.headers).length,
    };
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped middleware strategy
   */
  getWrappedStrategy(): IMiddlewareStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get the logger instance.
   *
   * @returns The logger instance
   */
  getLogger(): IMiddlewareLogger {
    return this.logger;
  }
}
