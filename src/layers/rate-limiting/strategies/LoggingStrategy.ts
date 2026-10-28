/**
 * Rate Limiting Logging Strategy
 *
 * Adds structured logging to rate limiting operations.
 *
 * @module RateLimitingLayer/Strategies
 */

import { IRateLimitingStrategy } from './DefaultStrategy';
import { RateLimitingErrorFactory } from '../errors';

export interface RateLimitingLoggingStrategyOptions {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRequests: boolean;
  logResponses: boolean;
  logErrors: boolean;
  includeMetadata: boolean;
  logger?: RateLimitingLogger;
}

export interface RateLimitingLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_OPTIONS: RateLimitingLoggingStrategyOptions = {
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  logErrors: true,
  includeMetadata: true,
};

export class RateLimitingLoggingStrategy implements IRateLimitingStrategy {
  readonly name = 'logging';
  readonly priority = 5;
  private readonly options: RateLimitingLoggingStrategyOptions;
  private readonly wrappedStrategy: IRateLimitingStrategy;
  private _executionCount: number;

  constructor(wrappedStrategy: IRateLimitingStrategy, options: Partial<RateLimitingLoggingStrategyOptions> = {}) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._executionCount = 0;

    if (!this.options.logger) {
      this.options.logger = {
        debug: (msg, meta) => console.debug(`[RATE-LIMIT][DEBUG] ${msg}`, meta ?? ''),
        info: (msg, meta) => console.info(`[RATE-LIMIT][INFO] ${msg}`, meta ?? ''),
        warn: (msg, meta) => console.warn(`[RATE-LIMIT][WARN] ${msg}`, meta ?? ''),
        error: (msg, meta) => console.error(`[RATE-LIMIT][ERROR] ${msg}`, meta ?? ''),
      };
    }
  }

  canHandle(input: unknown): boolean {
    return this.wrappedStrategy.canHandle(input);
  }

  async execute(
    input: unknown
  ): Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }> {
    this._executionCount++;
    const startTime = Date.now();
    const executionId = `rl-${this._executionCount}-${startTime}`;

    if (this.options.logRequests) {
      this.logRequest(executionId, input);
    }

    try {
      const result = await this.wrappedStrategy.execute(input);
      const duration = Date.now() - startTime;

      if (this.options.logResponses) {
        this.logResponse(executionId, result, duration);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this.options.logErrors) {
        this.logError(executionId, error as Error, duration);
      }

      throw RateLimitingErrorFactory.execution(
        `Logging strategy execution failed: ${(error as Error).message}`,
        { operation: 'execute', metadata: { executionId, duration } },
        error as Error
      );
    }
  }

  private logRequest(executionId: string, input: unknown): void {
    const meta: Record<string, unknown> = {
      executionId,
      strategy: this.wrappedStrategy.name,
      timestamp: Date.now(),
    };

    if (this.options.includeMetadata && input !== null && input !== undefined) {
      meta.inputType = typeof input;
      meta.inputKeys = input && typeof input === 'object' ? Object.keys(input) : [];
    }

    this.options.logger!.info(`Rate limit request received`, meta);
  }

  private logResponse(
    executionId: string,
    result: { success: boolean; data?: unknown; error?: { code: string; message: string } },
    duration: number
  ): void {
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
      this.options.logger!.info(`Rate limit request completed`, meta);
    } else {
      this.options.logger!.warn(`Rate limit request failed`, meta);
    }
  }

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

    this.options.logger!.error(`Rate limit request error`, meta);
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getWrappedStrategy(): IRateLimitingStrategy {
    return this.wrappedStrategy;
  }

  setLogger(logger: RateLimitingLogger): void {
    this.options.logger = logger;
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.options.logLevel = level;
  }
}

export class RateLimitingLoggingStrategyFactory {
  static create(
    wrappedStrategy: IRateLimitingStrategy,
    options?: Partial<RateLimitingLoggingStrategyOptions>
  ): RateLimitingLoggingStrategy {
    return new RateLimitingLoggingStrategy(wrappedStrategy, options);
  }

  static createWithDefaultLogger(
    wrappedStrategy: IRateLimitingStrategy,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): RateLimitingLoggingStrategy {
    return new RateLimitingLoggingStrategy(wrappedStrategy, { logLevel });
  }
}
