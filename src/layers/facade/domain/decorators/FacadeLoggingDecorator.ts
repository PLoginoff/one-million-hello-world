/**
 * FacadeLoggingDecorator
 */

export interface IFacadeComponent {
  execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>;
  getName(): string;
}

export interface FacadeLogEntry {
  timestamp: number;
  level: string;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class FacadeLoggingDecorator implements IFacadeComponent {
  private _wrapped: IFacadeComponent;
  private _logs: FacadeLogEntry[];
  private _logLevel: string;
  private _maxLogs: number;

  constructor(wrapped: IFacadeComponent, logLevel: string = 'info', maxLogs: number = 1000) {
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

  getLogs(): FacadeLogEntry[] {
    return [...this._logs];
  }
  getLogsByLevel(level: string): FacadeLogEntry[] {
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
