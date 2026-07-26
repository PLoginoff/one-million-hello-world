/**
 * IdentityProviderExecutionService
 */

export interface ExecutionRecord {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  input: unknown;
  output?: unknown;
  error?: string;
  metadata: Record<string, unknown>;
}

export class IdentityProviderExecutionService {
  private _records: Map<string, ExecutionRecord>;
  private _activeExecutions: Set<string>;

  constructor() {
    this._records = new Map();
    this._activeExecutions = new Set();
  }

  start(id: string, input: unknown, metadata: Record<string, unknown> = {}): ExecutionRecord {
    const record: ExecutionRecord = {
      id: id,
      status: 'running',
      startTime: Date.now(),
      input: input,
      metadata: metadata,
    };
    this._records.set(id, record);
    this._activeExecutions.add(id);
    return record;
  }

  complete(id: string, output: unknown): ExecutionRecord | null {
    const record = this._records.get(id);
    if (!record) return null;
    record.status = 'completed';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.output = output;
    this._activeExecutions.delete(id);
    return record;
  }

  fail(id: string, error: string): ExecutionRecord | null {
    const record = this._records.get(id);
    if (!record) return null;
    record.status = 'failed';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.error = error;
    this._activeExecutions.delete(id);
    return record;
  }

  getRecord(id: string): ExecutionRecord | null {
    return this._records.get(id) ?? null;
  }

  getAllRecords(): ExecutionRecord[] {
    return Array.from(this._records.values());
  }

  getActiveExecutions(): ExecutionRecord[] {
    return Array.from(this._activeExecutions)
      .map((id) => this._records.get(id))
      .filter((r): r is ExecutionRecord => r !== null && r !== undefined);
  }

  getCompletedExecutions(): ExecutionRecord[] {
    return this.getAllRecords().filter((r) => r.status === 'completed');
  }

  getFailedExecutions(): ExecutionRecord[] {
    return this.getAllRecords().filter((r) => r.status === 'failed');
  }

  getSuccessRate(): number {
    const total = this._records.size;
    if (total === 0) return 1.0;
    const completed = this.getCompletedExecutions().length;
    return completed / total;
  }

  getAverageDuration(): number {
    const completed = this.getCompletedExecutions();
    if (completed.length === 0) return 0;
    const total = completed.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
    return total / completed.length;
  }

  cancel(id: string): boolean {
    if (!this._activeExecutions.has(id)) return false;
    this._activeExecutions.delete(id);
    const record = this._records.get(id);
    if (record) {
      record.status = 'failed';
      record.error = 'Cancelled';
      record.endTime = Date.now();
      record.durationMs = record.endTime - record.startTime;
    }
    return true;
  }

  clear(): void {
    this._records.clear();
    this._activeExecutions.clear();
  }

  count(): number {
    return this._records.size;
  }
}
