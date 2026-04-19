/**
 * EventLogger - Monitoring Implementation
 * 
 * Logs events for debugging and auditing purposes.
 * Provides structured logging with multiple log levels.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export interface LoggerOptions {
  level?: LogLevel;
  enableConsole?: boolean;
  enableFile?: boolean;
  maxEntries?: number;
}

export class EventLogger {
  private _level: LogLevel;
  private _enableConsole: boolean;
  private _entries: LogEntry[];
  private _maxEntries: number;

  constructor(options: LoggerOptions = {}) {
    this._level = options.level || LogLevel.INFO;
    this._enableConsole = options.enableConsole !== false;
    this._entries = [];
    this._maxEntries = options.maxEntries || 10000;
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

  error(message: string, context?: Record<string, unknown>): void {
    this._log(LogLevel.ERROR, message, context);
  }

  getEntries(level?: LogLevel, limit?: number): LogEntry[] {
    let entries = this._entries;

    if (level) {
      entries = entries.filter(entry => entry.level === level);
    }

    if (limit) {
      entries = entries.slice(-limit);
    }

    return entries.map(entry => ({ ...entry }));
  }

  getRecentEntries(count: number): LogEntry[] {
    return this._entries.slice(-count).map(entry => ({ ...entry }));
  }

  clear(): void {
    this._entries = [];
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  getLevel(): LogLevel {
    return this._level;
  }

  private _log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this._shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
    };

    this._entries.push(entry);

    if (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }

    if (this._enableConsole) {
      this._logToConsole(entry);
    }
  }

  private _shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this._level);
  }

  private _logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.context || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.context || '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.context || '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.context || '');
        break;
    }
  }
}
