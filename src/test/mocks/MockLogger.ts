/**
 * Mock logger for testing
 */

export interface LogEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

export class MockLogger {
  readonly logs: LogEntry[] = [];

  log(level: string, message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level, message, meta, timestamp: Date.now() });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  getLogsByLevel(level: string): LogEntry[] {
    return this.logs.filter((l) => l.level === level);
  }

  clear(): void {
    this.logs.length = 0;
  }

  hasMessage(message: string): boolean {
    return this.logs.some((l) => l.message === message);
  }

  hasLevel(level: string): boolean {
    return this.logs.some((l) => l.level === level);
  }
}
