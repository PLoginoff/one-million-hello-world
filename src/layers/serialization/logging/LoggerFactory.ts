/**
 * Logger Factory
 * 
 * Factory for creating logger instances.
 */

import { ILogger, LogLevel } from './ILogger';
import { ConsoleLogger } from './ConsoleLogger';
import { MemoryLogger } from './MemoryLogger';

export enum LoggerType {
  CONSOLE = 'console',
  MEMORY = 'memory',
}

export class LoggerFactory {
  private static _defaultLevel: LogLevel = LogLevel.INFO;
  private static _defaultType: LoggerType = LoggerType.CONSOLE;

  /**
   * Sets the default log level
   */
  static setDefaultLevel(level: LogLevel): void {
    LoggerFactory._defaultLevel = level;
  }

  /**
   * Sets the default logger type
   */
  static setDefaultType(type: LoggerType): void {
    LoggerFactory._defaultType = type;
  }

  /**
   * Creates a logger
   */
  static create(name: string, type?: LoggerType, level?: LogLevel): ILogger {
    const loggerType = type ?? LoggerFactory._defaultType;
    const loggerLevel = level ?? LoggerFactory._defaultLevel;

    switch (loggerType) {
      case LoggerType.CONSOLE:
        return new ConsoleLogger(name, loggerLevel);
      case LoggerType.MEMORY:
        return new MemoryLogger(name, loggerLevel);
      default:
        return new ConsoleLogger(name, loggerLevel);
    }
  }

  /**
   * Creates a console logger
   */
  static createConsole(name: string, level?: LogLevel): ILogger {
    return new ConsoleLogger(name, level ?? LoggerFactory._defaultLevel);
  }

  /**
   * Creates a memory logger
   */
  static createMemory(name: string, level?: LogLevel, maxEntries?: number): ILogger {
    return new MemoryLogger(name, level ?? LoggerFactory._defaultLevel, maxEntries);
  }
}
