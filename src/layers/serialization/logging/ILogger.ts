/**
 * Logger Interface
 * 
 * Defines the contract for logging operations.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface ILogger {
  /**
   * Logs a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs an info message
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Logs an error message
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;

  /**
   * Logs a fatal error message
   */
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void;

  /**
   * Gets the current log level
   */
  getLevel(): LogLevel;

  /**
   * Sets the log level
   */
  setLevel(level: LogLevel): void;

  /**
   * Checks if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean;
}
