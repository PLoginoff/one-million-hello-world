/**
 * Logging Decorator
 * 
 * Decorator that adds logging functionality to serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface ILogger {
  log(message: string): void;
  error(message: string, error?: Error): void;
  warn(message: string): void;
  debug(message: string): void;
}

export class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(`[Serialization] ${message}`);
  }

  error(message: string, error?: Error): void {
    console.error(`[Serialization Error] ${message}`, error);
  }

  warn(message: string): void {
    console.warn(`[Serialization Warning] ${message}`);
  }

  debug(message: string): void {
    console.debug(`[Serialization Debug] ${message}`);
  }
}

export class NoOpLogger implements ILogger {
  log(): void {}
  error(): void {}
  warn(): void {}
  debug(): void {}
}

export class LoggingDecorator implements ISerializationStrategy {
  private _strategy: ISerializationStrategy;
  private _logger: ILogger;
  private _enabled: boolean;
  private _logData: boolean;

  constructor(
    strategy: ISerializationStrategy,
    logger?: ILogger,
    logData: boolean = false
  ) {
    this._strategy = strategy;
    this._logger = logger ?? new ConsoleLogger();
    this._enabled = true;
    this._logData = logData;
  }

  serialize(data: unknown): string {
    const startTime = Date.now();
    
    if (this._enabled) {
      this._logger.debug(`Starting serialization with ${this._strategy.getFormatName()} strategy`);
      if (this._logData) {
        this._logger.debug(`Data: ${JSON.stringify(data)}`);
      }
    }

    try {
      const result = this._strategy.serialize(data);
      const duration = Date.now() - startTime;

      if (this._enabled) {
        this._logger.log(
          `Serialization completed in ${duration}ms using ${this._strategy.getFormatName()}`
        );
        if (this._logData) {
          this._logger.debug(`Result: ${result.substring(0, 100)}...`);
        }
      }

      return result;
    } catch (error) {
      if (this._enabled) {
        this._logger.error(
          `Serialization failed with ${this._strategy.getFormatName()}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
      throw error;
    }
  }

  deserialize(data: string): unknown {
    const startTime = Date.now();
    
    if (this._enabled) {
      this._logger.debug(`Starting deserialization with ${this._strategy.getFormatName()} strategy`);
      if (this._logData) {
        this._logger.debug(`Data: ${data.substring(0, 100)}...`);
      }
    }

    try {
      const result = this._strategy.deserialize(data);
      const duration = Date.now() - startTime;

      if (this._enabled) {
        this._logger.log(
          `Deserialization completed in ${duration}ms using ${this._strategy.getFormatName()}`
        );
        if (this._logData) {
          this._logger.debug(`Result: ${JSON.stringify(result).substring(0, 100)}...`);
        }
      }

      return result;
    } catch (error) {
      if (this._enabled) {
        this._logger.error(
          `Deserialization failed with ${this._strategy.getFormatName()}`,
          error instanceof Error ? error : new Error(String(error))
        );
      }
      throw error;
    }
  }

  getContentType(): ContentType {
    return this._strategy.getContentType();
  }

  getFormatName(): string {
    return this._strategy.getFormatName();
  }

  canSerialize(data: unknown): boolean {
    const result = this._strategy.canSerialize(data);
    
    if (this._enabled) {
      this._logger.debug(
        `Can serialize check for ${this._strategy.getFormatName()}: ${result}`
      );
    }
    
    return result;
  }

  canDeserialize(data: string): boolean {
    const result = this._strategy.canDeserialize(data);
    
    if (this._enabled) {
      this._logger.debug(
        `Can deserialize check for ${this._strategy.getFormatName()}: ${result}`
      );
    }
    
    return result;
  }

  /**
   * Enables or disables logging
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if logging is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Enables or disables logging of data content
   * 
   * @param logData - Log data flag
   */
  setLogData(logData: boolean): void {
    this._logData = logData;
  }

  /**
   * Gets the underlying strategy
   * 
   * @returns Wrapped strategy
   */
  getStrategy(): ISerializationStrategy {
    return this._strategy;
  }

  /**
   * Gets the logger
   * 
   * @returns Logger instance
   */
  getLogger(): ILogger {
    return this._logger;
  }
}
