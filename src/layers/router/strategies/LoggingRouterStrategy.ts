/**
 * Logging Router Strategy
 *
 * Decorator that wraps a router strategy and adds structured logging
 * for all routing operations.
 *
 * @module RouterLayer/Strategies
 */

import { IRouterStrategy, RouterStrategyContext, RouterStrategyResult } from './IRouterStrategy';

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
 * Structured log entry for routing operations.
 */
export interface RouterLogEntry {
  /** Timestamp of the log entry */
  readonly timestamp: number;
  /** Log level */
  readonly level: LogLevel;
  /** Strategy name that generated the log */
  readonly strategyName: string;
  /** Operation being logged */
  readonly operation: 'execute' | 'canHandle';
  /** Routing context (sanitized) */
  readonly context: {
    readonly method: string;
    readonly path: string;
    readonly hasQuery: boolean;
    readonly hasHeaders: boolean;
    readonly correlationId?: string;
  };
  /** Result of the operation (for execute) */
  readonly result?: {
    readonly success: boolean;
    readonly executionTimeMs: number;
    readonly routesEvaluated?: number;
    readonly errorCode?: string;
  };
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface IRouterLogger {
  /** Log a debug message */
  debug(entry: RouterLogEntry): void;
  /** Log an info message */
  info(entry: RouterLogEntry): void;
  /** Log a warning message */
  warn(entry: RouterLogEntry): void;
  /** Log an error message */
  error(entry: RouterLogEntry): void;
}

/**
 * Default console logger implementation.
 */
export class ConsoleRouterLogger implements IRouterLogger {
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
    return ConsoleRouterLogger.levelOrder[level] >= ConsoleRouterLogger.levelOrder[this.minLevel];
  }

  private log(level: LogLevel, entry: RouterLogEntry): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const logMethod = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : console.log;
    logMethod(JSON.stringify({ ...entry, level }));
  }

  debug(entry: RouterLogEntry): void {
    this.log(LogLevel.DEBUG, entry);
  }

  info(entry: RouterLogEntry): void {
    this.log(LogLevel.INFO, entry);
  }

  warn(entry: RouterLogEntry): void {
    this.log(LogLevel.WARN, entry);
  }

  error(entry: RouterLogEntry): void {
    this.log(LogLevel.ERROR, entry);
  }
}

/**
 * Logging router strategy decorator.
 *
 * Wraps an existing router strategy and adds structured logging
 * for all routing operations without modifying the core logic.
 */
export class LoggingRouterStrategy implements IRouterStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IRouterStrategy;
  private readonly logger: IRouterLogger;
  private readonly logCanHandle: boolean;

  /**
   * Create a new LoggingRouterStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with logging
   * @param logger - Optional custom logger (defaults to console logger)
   * @param logCanHandle - Whether to log canHandle checks (default: false)
   */
  constructor(wrappedStrategy: IRouterStrategy, logger?: IRouterLogger, logCanHandle: boolean = false) {
    this.wrappedStrategy = wrappedStrategy;
    this.logger = logger ?? new ConsoleRouterLogger();
    this.logCanHandle = logCanHandle;
    this.name = `logging-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The routing context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: RouterStrategyContext): boolean {
    const result = this.wrappedStrategy.canHandle(context);

    if (this.logCanHandle) {
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
    }

    return result;
  }

  /**
   * Execute the wrapped strategy with logging.
   *
   * @param context - The routing context
   * @returns Promise resolving to the routing result
   */
  async execute(context: RouterStrategyContext): Promise<RouterStrategyResult> {
    const startTime = Date.now();

    this.logger.info({
      timestamp: startTime,
      level: LogLevel.INFO,
      strategyName: this.name,
      operation: 'execute',
      context: this.sanitizeContext(context),
    });

    try {
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
            routesEvaluated: result.metadata?.routesEvaluated,
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
            routesEvaluated: result.metadata?.routesEvaluated,
            errorCode: result.error?.code,
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
   * @param context - The routing context
   * @returns Sanitized context safe for logging
   */
  private sanitizeContext(context: RouterStrategyContext): RouterLogEntry['context'] {
    return {
      method: context.method,
      path: context.path,
      hasQuery: Boolean(context.query && Object.keys(context.query).length > 0),
      hasHeaders: Boolean(context.headers && Object.keys(context.headers).length > 0),
      correlationId: context.correlationId,
    };
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped router strategy
   */
  getWrappedStrategy(): IRouterStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get the logger instance.
   *
   * @returns The logger instance
   */
  getLogger(): IRouterLogger {
    return this.logger;
  }
}
