/**
 * Security Logging Strategy
 *
 * Adds structured logging to security operations.
 *
 * @module SecurityLayer/Strategies
 */

import { ISecurityStrategy } from './DefaultStrategy';
import { SecurityErrorFactory } from '../errors';

export interface SecurityLoggingStrategyOptions {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRequests: boolean;
  logResponses: boolean;
  logErrors: boolean;
  includeMetadata: boolean;
  logger?: SecurityLogger;
}

export interface SecurityLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_OPTIONS: SecurityLoggingStrategyOptions = {
  logLevel: 'info',
  logRequests: true,
  logResponses: true,
  logErrors: true,
  includeMetadata: true,
};

export class SecurityLoggingStrategy implements ISecurityStrategy {
  readonly name = 'logging';
  readonly priority = 5;
  private readonly options: SecurityLoggingStrategyOptions;
  private readonly wrappedStrategy: ISecurityStrategy;
  private _executionCount: number;

  constructor(wrappedStrategy: ISecurityStrategy, options: Partial<SecurityLoggingStrategyOptions> = {}) {
    this.wrappedStrategy = wrappedStrategy;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._executionCount = 0;

    // Default console logger if none provided
    if (!this.options.logger) {
      this.options.logger = {
        debug: (msg, meta) => console.debug(`[SECURITY][DEBUG] ${msg}`, meta ?? ''),
        info: (msg, meta) => console.info(`[SECURITY][INFO] ${msg}`, meta ?? ''),
        warn: (msg, meta) => console.warn(`[SECURITY][WARN] ${msg}`, meta ?? ''),
        error: (msg, meta) => console.error(`[SECURITY][ERROR] ${msg}`, meta ?? ''),
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
    const executionId = `sec-${this._executionCount}-${startTime}`;

    // Log request
    if (this.options.logRequests) {
      this.logRequest(executionId, input);
    }

    try {
      const result = await this.wrappedStrategy.execute(input);
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

      // Re-throw as security error
      throw SecurityErrorFactory.execution(
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

    this.options.logger!.info(`Security request received`, meta);
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
      this.options.logger!.info(`Security request completed`, meta);
    } else {
      this.options.logger!.warn(`Security request failed`, meta);
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

    this.options.logger!.error(`Security request error`, meta);
  }

  getExecutionCount(): number {
    return this._executionCount;
  }

  getWrappedStrategy(): ISecurityStrategy {
    return this.wrappedStrategy;
  }

  setLogger(logger: SecurityLogger): void {
    this.options.logger = logger;
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.options.logLevel = level;
  }
}

/**
 * Factory for creating logging strategy
 */
export class SecurityLoggingStrategyFactory {
  static create(
    wrappedStrategy: ISecurityStrategy,
    options?: Partial<SecurityLoggingStrategyOptions>
  ): SecurityLoggingStrategy {
    return new SecurityLoggingStrategy(wrappedStrategy, options);
  }

  static createWithDefaultLogger(
    wrappedStrategy: ISecurityStrategy,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): SecurityLoggingStrategy {
    return new SecurityLoggingStrategy(wrappedStrategy, { logLevel });
  }
}
