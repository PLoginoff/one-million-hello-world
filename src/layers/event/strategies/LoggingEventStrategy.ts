/**
 * Logging Event Strategy
 *
 * Decorator strategy that wraps a base event strategy and adds structured logging
 * for all operations. Provides detailed audit trails for event executions.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Log level enumeration for structured logging.
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Structured log entry for event operations.
 */
export interface EventLogEntry {
  /** Timestamp of the log entry */
  readonly timestamp: number;
  /** Log level */
  readonly level: LogLevel;
  /** Name of the strategy that generated the log */
  readonly strategyName: string;
  /** Operation being performed */
  readonly operation: string;
  /** Event name being operated on */
  readonly eventName: string;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Execution duration in milliseconds */
  readonly durationMs?: number;
  /** Whether the operation succeeded */
  readonly success?: boolean;
  /** Subscription ID if applicable */
  readonly subscriptionId?: string;
  /** Error details if operation failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  /** Additional context data */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface IEventLogger {
  /** Logs a debug message */
  debug(entry: EventLogEntry): void;
  /** Logs an info message */
  info(entry: EventLogEntry): void;
  /** Logs a warning message */
  warn(entry: EventLogEntry): void;
  /** Logs an error message */
  error(entry: EventLogEntry): void;
}

/**
 * Default console-based logger implementation.
 */
export class ConsoleEventLogger implements IEventLogger {
  private readonly _minLevel: LogLevel;

  private static readonly _levelOrder: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };

  /**
   * Creates a new ConsoleEventLogger.
   *
   * @param minLevel - Minimum log level to output (default: INFO)
   */
  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this._minLevel = minLevel;
  }

  /** @inheritdoc */
  public debug(entry: EventLogEntry): void {
    this._log(LogLevel.DEBUG, entry);
  }

  /** @inheritdoc */
  public info(entry: EventLogEntry): void {
    this._log(LogLevel.INFO, entry);
  }

  /** @inheritdoc */
  public warn(entry: EventLogEntry): void {
    this._log(LogLevel.WARN, entry);
  }

  /** @inheritdoc */
  public error(entry: EventLogEntry): void {
    this._log(LogLevel.ERROR, entry);
  }

  private _log(level: LogLevel, entry: EventLogEntry): void {
    if (ConsoleEventLogger._levelOrder[level] < ConsoleEventLogger._levelOrder[this._minLevel]) {
      return;
    }

    const logEntry = {
      ...entry,
      level,
      timestamp: entry.timestamp ?? Date.now(),
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
    }
  }
}

/**
 * Logging decorator strategy that wraps a base strategy and adds structured logging.
 *
 * @typeParam T - The type of result data returned by the wrapped strategy
 */
export class LoggingEventStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name: string;

  /** @inheritdoc */
  public readonly priority: number;

  private readonly _wrappedStrategy: IEventStrategy<T>;
  private readonly _logger: IEventLogger;
  private readonly _logLevel: LogLevel;

  /**
   * Creates a new LoggingEventStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with logging
   * @param logger - Optional custom logger (defaults to console logger)
   * @param logLevel - Minimum log level (default: INFO)
   */
  constructor(wrappedStrategy: IEventStrategy<T>, logger?: IEventLogger, logLevel: LogLevel = LogLevel.INFO) {
    this._wrappedStrategy = wrappedStrategy;
    this._logger = logger ?? new ConsoleEventLogger(logLevel);
    this._logLevel = logLevel;
    this.name = `logging-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();
    const correlationId = context.correlationId ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Log operation start
    this._logger.info({
      timestamp: startTime,
      level: LogLevel.INFO,
      strategyName: this.name,
      operation: context.operation,
      eventName: context.eventName,
      correlationId,
      metadata: {
        hasPayload: context.payload !== undefined,
        hasHandler: context.handler !== undefined,
        hasSubscriptionId: context.subscriptionId !== undefined,
        once: context.once ?? false,
      },
    });

    try {
      const result = await this._wrappedStrategy.execute(context);
      const durationMs = Date.now() - startTime;

      // Log successful completion
      this._logger.info({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        strategyName: this.name,
        operation: context.operation,
        eventName: context.eventName,
        correlationId,
        durationMs,
        success: result.success,
        subscriptionId: result.metadata?.subscriptionId,
        metadata: result.metadata,
      });

      // Log debug details for successful operations
      if (this._logLevel === LogLevel.DEBUG) {
        this._logger.debug({
          timestamp: Date.now(),
          level: LogLevel.DEBUG,
          strategyName: this.name,
          operation: context.operation,
          eventName: context.eventName,
          correlationId,
          durationMs,
          success: true,
          subscriptionId: result.metadata?.subscriptionId,
          metadata: {
            resultData: result.data,
            wrappedStrategyResult: result.metadata,
          },
        });
      }

      return {
        ...result,
        metadata: {
          ...result.metadata,
          strategyName: this.name,
          executionTimeMs: result.metadata?.executionTimeMs ?? 0,
          timestamp: result.metadata?.timestamp ?? Date.now(),
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log error
      this._logger.error({
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        strategyName: this.name,
        operation: context.operation,
        eventName: context.eventName,
        correlationId,
        durationMs,
        success: false,
        error: {
          code: 'STRATEGY_EXECUTION_ERROR',
          message: errorMessage,
        },
        metadata: {
          originalError: error instanceof Error ? error.stack : String(error),
        },
      });

      throw error;
    }
  }

  /**
   * Gets the wrapped strategy instance.
   *
   * @returns The wrapped strategy
   */
  public getWrappedStrategy(): IEventStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the logger instance.
   *
   * @returns The logger
   */
  public getLogger(): IEventLogger {
    return this._logger;
  }
}
