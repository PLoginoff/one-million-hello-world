/**
 * File Audit Adapter
 *
 * Writes audit entries to an in-memory file buffer (for testing).
 */

import { IAudit } from '../interfaces/IAudit';
import { AuditContext, AuditResult } from '../types/audit-types';

interface AuditEntry {
  timestamp: number;
  input: unknown;
  metadata: Record<string, unknown>;
}

export class FileAuditAdapter implements IAudit {
  private _entries: AuditEntry[];
  private _filePath: string;
  private _config: Record<string, unknown>;

  constructor(filePath: string = '/var/log/audit.log') {
    this._entries = [];
    this._filePath = filePath;
    this._config = {};
  }

  async execute(context: AuditContext): Promise<AuditResult<unknown>> {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      input: context.input,
      metadata: context.metadata,
    };

    this._entries.push(entry);

    await Promise.resolve();
    return { success: true, data: { entryId: this._entries.length, filePath: this._filePath } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.filePath === 'string') {
      this._filePath = config.filePath;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'file',
      filePath: this._filePath,
      entryCount: this._entries.length,
    };
  }

  getEntries(): AuditEntry[] {
    return [...this._entries];
  }

  clear(): void {
    this._entries = [];
  }
}
