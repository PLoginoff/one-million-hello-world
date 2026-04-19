/**
 * Console Logger
 * 
 * Logger that writes to console.
 */

import { BaseLogger } from './BaseLogger';
import { LogLevel, LogEntry } from './ILogger';

export class ConsoleLogger extends BaseLogger {
  constructor(name: string = 'ConsoleLogger', level: LogLevel = LogLevel.INFO) {
    super(name, level);
  }

  protected _write(entry: LogEntry): void {
    const formatted = this._formatEntry(entry);

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted);
        break;
    }
  }
}
