/**
 * Base Logger
 * 
 * Abstract base class for loggers.
 */

import { ILogger, LogLevel, LogEntry } from './ILogger';

export abstract class BaseLogger implements ILogger {
  protected _level: LogLevel;
  protected _name: string;

  constructor(name: string, level: LogLevel = LogLevel.INFO) {
    this._name = name;
    this._level = level;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this._log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this._log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this._log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this._log(LogLevel.ERROR, message, context, error);
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this._log(LogLevel.FATAL, message, context, error);
  }

  getLevel(): LogLevel {
    return this._level;
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  isLevelEnabled(level: LogLevel): boolean {
    return level >= this._level;
  }

  /**
   * Creates a log entry
   */
  protected _createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date(),
      context,
      error,
    };
  }

  /**
   * Formats log entry to string
   */
  protected _formatEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const errorStr = entry.error ? ` ${entry.error.stack || entry.error.message}` : '';
    return `[${timestamp}] [${levelName}] [${this._name}] ${entry.message}${contextStr}${errorStr}`;
  }

  /**
   * Logs a message at the specified level
   */
  protected _log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const entry = this._createEntry(level, message, context, error);
    this._write(entry);
  }

  /**
   * Writes the log entry (to be implemented by subclasses)
   */
  protected abstract _write(entry: LogEntry): void;

  /**
   * Gets the logger name
   */
  getName(): string {
    return this._name;
  }
}
