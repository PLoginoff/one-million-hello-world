/**
 * Logging Saga Strategy
 *
 * Decorator that wraps a saga strategy and adds structured logging
 * for all execution steps, compensations, and results.
 *
 * @module SagaLayer/Strategies
 */

import { ISagaStrategy, SagaContext, SagaStrategyResult } from './ISagaStrategy';
import { SagaConfig, SagaStep } from '../types/saga-types';

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
  /** Current step name */
  stepName?: string;
  /** Step index */
  stepIndex?: number;
  /** Total steps */
  totalSteps?: number;
  /** Additional context data */
  context: Record<string, unknown>;
  /** Duration in milliseconds (for completed operations) */
  durationMs?: number;
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

  constructor(prefix: string = 'Saga') {
    this._prefix = prefix;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      strategy: this._prefix,
      operation: message,
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
 * Logging decorator for saga strategies
 *
 * Wraps a base strategy and adds structured logging for all operations.
 *
 * @typeParam T - The type of result returned by the saga
 */
export class LoggingSagaStrategy<T = unknown> implements ISagaStrategy<T> {
  readonly name: string;
  readonly priority: number;

  private readonly _wrapped: ISagaStrategy<T>;
  private readonly _logger: IStructuredLogger;
  private readonly _logLevel: LogLevel;

  /**
   * Creates a new LoggingSagaStrategy
   *
   * @param wrapped - The base strategy to wrap
   * @param logger - Optional custom logger (defaults to ConsoleLogger)
   * @param logLevel - Minimum log level (defaults to INFO)
   */
  constructor(wrapped: ISagaStrategy<T>, logger?: IStructuredLogger, logLevel: LogLevel = LogLevel.INFO) {
    this._wrapped = wrapped;
    this._logger =
      logger ?? new ConsoleLogger(`Logging${wrapped.name.charAt(0).toUpperCase() + wrapped.name.slice(1)}Strategy`);
    this._logLevel = logLevel;
    this.name = `logging-${wrapped.name}`;
    this.priority = wrapped.priority;
  }

  /**
   * Executes a saga with the given steps and logging
   *
   * @param context - Execution context
   * @returns Strategy execution result
   */
  async execute(context: SagaContext<T>): Promise<SagaStrategyResult<T>> {
    const startTime = Date.now();
    const stepNames = context.steps.map((s) => s.name).join(', ');

    this.log(LogLevel.INFO, 'Starting saga execution', {
      totalSteps: context.steps.length,
      steps: stepNames,
      enableCompensation: context.enableCompensation,
      currentStepIndex: context.currentStepIndex,
    });

    try {
      const result = await this._wrapped.execute(context);
      const durationMs = Date.now() - startTime;

      if (result.success) {
        this.log(LogLevel.INFO, 'Saga execution succeeded', {
          executedSteps: result.executedSteps.join(', '),
          durationMs,
          stepDurationsMs: Object.fromEntries(result.stepDurationsMs),
        });
      } else {
        this.log(LogLevel.WARN, 'Saga execution failed, compensation triggered', {
          executedSteps: result.executedSteps.join(', '),
          compensatedSteps: result.compensatedSteps.join(', '),
          durationMs,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log(LogLevel.ERROR, 'Saga execution threw exception', {
        durationMs,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Compensates executed steps in case of failure with logging
   *
   * @param context - Execution context with executed steps
   * @param executedSteps - Names of steps that were executed
   * @param stepData - Data from executed steps
   * @returns Array of compensation results
   */
  async compensate(
    context: SagaContext<T>,
    executedSteps: string[],
    stepData: Map<string, T>
  ): Promise<Array<{ stepName: string; success: boolean; error?: string }>> {
    this.log(LogLevel.INFO, 'Starting saga compensation', {
      stepsToCompensate: executedSteps.join(', '),
      totalSteps: executedSteps.length,
    });

    try {
      const results = await this._wrapped.compensate(context, executedSteps, stepData);
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      this.log(LogLevel.INFO, 'Saga compensation completed', {
        successfulCompensations: successful,
        failedCompensations: failed,
        results: results.map((r) => `${r.stepName}: ${r.success ? 'success' : 'failed'}`).join(', '),
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log(LogLevel.ERROR, 'Saga compensation threw exception', {
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
  canHandle(context: SagaContext<unknown>): boolean {
    return this._wrapped.canHandle(context);
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
  getWrappedStrategy(): ISagaStrategy<T> {
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
