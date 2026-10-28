/**
 * Logging Validation Strategy
 *
 * Decorator that wraps a validation strategy and adds structured logging
 * for all validation operations.
 *
 * @module ValidationLayer/Strategies
 */

import { IValidationStrategy, ValidationStrategyContext, ValidationStrategyResult } from './IValidationStrategy';

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
 * Structured log entry for validation operations.
 */
export interface ValidationLogEntry {
  /** Timestamp of the log entry */
  readonly timestamp: number;
  /** Log level */
  readonly level: LogLevel;
  /** Strategy name that generated the log */
  readonly strategyName: string;
  /** Operation being logged */
  readonly operation: 'execute' | 'canHandle';
  /** Validation context (sanitized) */
  readonly context: {
    readonly fieldCount: number;
    readonly schemaFieldCount: number;
    readonly sanitize: boolean;
    readonly enableAsyncValidation: boolean;
    readonly enableCrossFieldValidation: boolean;
    readonly enableConditionalValidation: boolean;
    readonly correlationId?: string;
    readonly requestId?: string;
  };
  /** Result of the operation (for execute) */
  readonly result?: {
    readonly success: boolean;
    readonly executionTimeMs: number;
    readonly fieldsValidated?: number;
    readonly fieldsPassed?: number;
    readonly fieldsFailed?: number;
    readonly errorCount?: number;
    readonly warningCount?: number;
  };
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Logger interface for structured logging.
 */
export interface IValidationLogger {
  /** Log a debug message */
  debug(entry: ValidationLogEntry): void;
  /** Log an info message */
  info(entry: ValidationLogEntry): void;
  /** Log a warning message */
  warn(entry: ValidationLogEntry): void;
  /** Log an error message */
  error(entry: ValidationLogEntry): void;
}

/**
 * Default console logger implementation.
 */
export class ConsoleValidationLogger implements IValidationLogger {
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
    return ConsoleValidationLogger.levelOrder[level] >= ConsoleValidationLogger.levelOrder[this.minLevel];
  }

  private log(level: LogLevel, entry: ValidationLogEntry): void {
    if (!this.shouldLog(level)) {
      return;
    }
    const logMethod = level === LogLevel.ERROR ? console.error : level === LogLevel.WARN ? console.warn : console.log;
    logMethod(JSON.stringify({ ...entry, level }));
  }

  debug(entry: ValidationLogEntry): void {
    this.log(LogLevel.DEBUG, entry);
  }

  info(entry: ValidationLogEntry): void {
    this.log(LogLevel.INFO, entry);
  }

  warn(entry: ValidationLogEntry): void {
    this.log(LogLevel.WARN, entry);
  }

  error(entry: ValidationLogEntry): void {
    this.log(LogLevel.ERROR, entry);
  }
}

/**
 * Logging validation strategy decorator.
 *
 * Wraps an existing validation strategy and adds structured logging
 * for all validation operations without modifying the core logic.
 */
export class LoggingValidationStrategy implements IValidationStrategy {
  readonly name: string;
  readonly priority: number;

  private readonly wrappedStrategy: IValidationStrategy;
  private readonly logger: IValidationLogger;

  /**
   * Create a new LoggingValidationStrategy.
   *
   * @param wrappedStrategy - The strategy to wrap with logging
   * @param logger - Optional custom logger (defaults to console logger)
   */
  constructor(wrappedStrategy: IValidationStrategy, logger?: IValidationLogger) {
    this.wrappedStrategy = wrappedStrategy;
    this.logger = logger ?? new ConsoleValidationLogger();
    this.name = `logging-${wrappedStrategy.name}`;
    this.priority = wrappedStrategy.priority;
  }

  /**
   * Check if the wrapped strategy can handle the context.
   *
   * @param context - The validation context to evaluate
   * @returns True if the wrapped strategy can handle the context
   */
  canHandle(context: ValidationStrategyContext): boolean {
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
   * @param context - The validation context
   * @returns Promise resolving to the validation result
   */
  async execute(context: ValidationStrategyContext): Promise<ValidationStrategyResult> {
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
            fieldsValidated: result.metadata?.fieldsValidated,
            fieldsPassed: result.metadata?.fieldsPassed,
            fieldsFailed: result.metadata?.fieldsFailed,
            errorCount: result.errors.length,
            warningCount: result.warnings.length,
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
            fieldsValidated: result.metadata?.fieldsValidated,
            fieldsPassed: result.metadata?.fieldsPassed,
            fieldsFailed: result.metadata?.fieldsFailed,
            errorCount: result.errors.length,
            warningCount: result.warnings.length,
          },
          metadata: {
            errors: result.errors.map((e) => ({ field: e.field, code: e.code, message: e.message })),
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
          errorCount: 1,
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
   * @param context - The validation context
   * @returns Sanitized context safe for logging
   */
  private sanitizeContext(context: ValidationStrategyContext): ValidationLogEntry['context'] {
    return {
      fieldCount: Object.keys(context.data).length,
      schemaFieldCount: Object.keys(context.schema.fields ?? {}).length,
      sanitize: context.sanitize,
      enableAsyncValidation: context.enableAsyncValidation,
      enableCrossFieldValidation: context.enableCrossFieldValidation,
      enableConditionalValidation: context.enableConditionalValidation,
      correlationId: context.context.correlationId,
      requestId: context.context.requestId,
    };
  }

  /**
   * Get the wrapped strategy.
   *
   * @returns The wrapped validation strategy
   */
  getWrappedStrategy(): IValidationStrategy {
    return this.wrappedStrategy;
  }

  /**
   * Get the logger instance.
   *
   * @returns The logger instance
   */
  getLogger(): IValidationLogger {
    return this.logger;
  }
}
