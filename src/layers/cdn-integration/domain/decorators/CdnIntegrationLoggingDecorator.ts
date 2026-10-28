/**
 * CdnIntegrationLoggingDecorator
 */

export interface ICdnIntegrationComponent {
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>;
  getName(): string;
}

export interface CdnIntegrationLogEntry {
  timestamp: number;
  level: string;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class CdnIntegrationLoggingDecorator implements ICdnIntegrationComponent {
  private _wrapped: ICdnIntegrationComponent;
  private _logs: CdnIntegrationLogEntry[];
  private _logLevel: string;
  private _maxLogs: number;

  constructor(wrapped: ICdnIntegrationComponent, logLevel: string = 'info', maxLogs: number = 1000) {
    this._wrapped = wrapped;
    this._logs = [];
    this._logLevel = logLevel;
    this._maxLogs = maxLogs;
  }

  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
    this._log('info', 'Executing ' + this._wrapped.getName(), { input });
    const start = Date.now();
    try {
      const result = await this._wrapped.execute(input);
      const duration = Date.now() - start;
      if (result.success) {
        this._log('info', 'Execution succeeded', { duration, hasData: result.data !== undefined });
      } else {
        this._log('warn', 'Execution failed', { duration, error: result.error });
      }
      return result;
    } catch (e) {
      const dur = Date.now() - start;
      this._log('error', 'Execution threw', { duration: dur, error: (e as Error).message });
      throw e;
    }
  }

  getName(): string {
    return this._wrapped.getName() + '+logging';
  }

  getLogs(): CdnIntegrationLogEntry[] {
    return [...this._logs];
  }
  getLogsByLevel(level: string): CdnIntegrationLogEntry[] {
    return this._logs.filter((l) => l.level === level);
  }
  clearLogs(): void {
    this._logs = [];
  }
  getLogLevel(): string {
    return this._logLevel;
  }

  private _log(level: string, message: string, metadata?: Record<string, unknown>): void {
    this._logs.push({ timestamp: Date.now(), level, component: this._wrapped.getName(), message, metadata });
    if (this._logs.length > this._maxLogs) {
      this._logs.shift();
    }
  }
}
