/**
 * Logger Interface
 * 
 * Defines the contract for logging operations
 * in the Saga Layer.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface ILogger {
  /**
   * Logs a debug message
   * 
   * @param message - Message to log
   * @param context - Optional context data
   */
  debug(message: string, context?: unknown): void;

  /**
   * Logs an info message
   * 
   * @param message - Message to log
   * @param context - Optional context data
   */
  info(message: string, context?: unknown): void;

  /**
   * Logs a warning message
   * 
   * @param message - Message to log
   * @param context - Optional context data
   */
  warn(message: string, context?: unknown): void;

  /**
   * Logs an error message
   * 
   * @param message - Message to log
   * @param context - Optional context data
   */
  error(message: string, context?: unknown): void;

  /**
   * Sets the minimum log level
   * 
   * @param level - Minimum log level
   */
  setLogLevel(level: LogLevel): void;

  /**
   * Gets the current log level
   * 
   * @returns Current log level
   */
  getLogLevel(): LogLevel;

  /**
   * Enables or disables logging
   * 
   * @param enabled - Whether logging is enabled
   */
  setEnabled(enabled: boolean): void;

  /**
   * Checks if logging is enabled
   * 
   * @returns Whether logging is enabled
   */
  isEnabled(): boolean;
}
