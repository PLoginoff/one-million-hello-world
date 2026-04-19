/**
 * Memory Logger
 * 
 * Logger that stores entries in memory.
 */

import { BaseLogger } from './BaseLogger';
import { LogLevel, LogEntry } from './ILogger';

export class MemoryLogger extends BaseLogger {
  private _entries: LogEntry[];
  private _maxEntries: number;

  constructor(
    name: string = 'MemoryLogger',
    level: LogLevel = LogLevel.INFO,
    maxEntries: number = 1000
  ) {
    super(name, level);
    this._entries = [];
    this._maxEntries = maxEntries;
  }

  protected _write(entry: LogEntry): void {
    this._entries.push(entry);

    if (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
  }

  /**
   * Gets all log entries
   */
  getEntries(): LogEntry[] {
    return [...this._entries];
  }

  /**
   * Gets entries by log level
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this._entries.filter(entry => entry.level === level);
  }

  /**
   * Clears all log entries
   */
  clear(): void {
    this._entries = [];
  }

  /**
   * Gets the number of entries
   */
  size(): number {
    return this._entries.length;
  }

  /**
   * Sets the maximum number of entries
   */
  setMaxEntries(max: number): void {
    this._maxEntries = max;

    while (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
  }

  /**
   * Gets the maximum number of entries
   */
  getMaxEntries(): number {
    return this._maxEntries;
  }
}
