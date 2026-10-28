/**
 * HTTP Parser Logging Strategy
 *
 * Adds structured logging to HTTP parser operations.
 *
 * @module HttpParserLayer/Strategies
 */

import { IHttpParserStrategy } from './DefaultStrategy';
import { HttpParserErrorFactory } from '../errors';

export interface HttpParserLoggingStrategyOptions {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRequests: boolean;
  logResponses: boolean;
  logErrors: boolean;
  includeMetadata: boolean;
  logger?: HttpParserLogger;
}

export interface HttpParserLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_OPTIONS: HttpParserLoggingStrategyOptions = {
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  logErrors: true,
  includeMetadata: true,
};

export class HttpParserLoggingStrategy implements IHttpParserStrategy {
  readonly name = 'logging';
  readonly priority = 5;
  private readonly options: HttpParserLoggingStrategyOptions;
  private readonly wrappedStrategy: IHttpParserStrategy;
  private _executionCount: number;

  constructor(wrappedStrategy: IHttpParserStrategy, options: Partial<HttpParserLoggingStrategyOptions> = {}) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._executionCount = 0;

    if (!this.options.logger) {
      this.options.logger = {
        debug: (msg, meta) => console.debug(`[HTTP-PARSER][DEBUG] ${msg}`, meta ?? ''),
        info: (msg, meta) => console.info(`[HTTP-PARSER][INFO] ${msg}`, meta ?? ''),
        warn: (msg, meta) => console.warn(`[HTTP-PARSER][WARN] ${msg}`, meta ?? ''),
        error: (msg, meta) => console.error(`[HTTP-PARSER][ERROR] ${msg}`, meta ?? ''),
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
    const executionId = `hp-${this._executionCount}-${startTime}`;

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

      throw HttpParserErrorFactory.execution(
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

    this.options.logger!.info(`HTTP parser request received`, meta);
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
      this.options.logger!.info(`HTTP parser request completed`, meta);
    } else {
      this.options.logger!.warn(`HTTP parser request failed`, meta);
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

    this.options.logger!.error(`HTTP parser request error`, meta);
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getWrappedStrategy(): IHttpParserStrategy {
    return this.wrappedStrategy;
  }

  setLogger(logger: HttpParserLogger): void {
    this.options.logger = logger;
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.options.logLevel = level;
  }
}

export class HttpParserLoggingStrategyFactory {
  static create(
    wrappedStrategy: IHttpParserStrategy,
    options?: Partial<HttpParserLoggingStrategyOptions>
  ): HttpParserLoggingStrategy {
    return new HttpParserLoggingStrategy(wrappedStrategy, options);
  }

  static createWithDefaultLogger(
    wrappedStrategy: IHttpParserStrategy,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): HttpParserLoggingStrategy {
    return new HttpParserLoggingStrategy(wrappedStrategy, { logLevel });
  }
}
