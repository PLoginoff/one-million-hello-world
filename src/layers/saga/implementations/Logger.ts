/**
 * Logger Implementation
 * 
 * Concrete implementation of ILogger.
 * Provides console-based logging with level filtering.
 */

import { ILogger, LogLevel } from '../interfaces/ILogger';

export class Logger implements ILogger {
  private _logLevel: LogLevel;
  private _enabled: boolean;
  private readonly _levelPriority: Map<LogLevel, number>;

  constructor() {
    this._logLevel = LogLevel.INFO;
    this._enabled = false;
    this._levelPriority = new Map([
      [LogLevel.DEBUG, 0],
      [LogLevel.INFO, 1],
      [LogLevel.WARN, 2],
      [LogLevel.ERROR, 3],
    ]);
  }

  debug(message: string, context?: unknown): void {
    this._log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: unknown): void {
    this._log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: unknown): void {
    this._log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: unknown): void {
    this._log(LogLevel.ERROR, message, context);
  }

  setLogLevel(level: LogLevel): void {
    this._logLevel = level;
  }

  getLogLevel(): LogLevel {
    return this._logLevel;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  private _log(level: LogLevel, message: string, context?: unknown): void {
    if (!this._enabled) {
      return;
    }

    const levelPriority = this._levelPriority.get(level) ?? 0;
    const currentPriority = this._levelPriority.get(this._logLevel) ?? 0;

    if (levelPriority < currentPriority) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    if (context) {
      console.log(logMessage, context);
    } else {
      console.log(logMessage);
    }
  }
}
