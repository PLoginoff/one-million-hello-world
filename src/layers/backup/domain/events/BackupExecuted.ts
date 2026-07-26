/**
 * BackupExecuted Event
 *
 * Raised when backup execution completes.
 */

export interface BackupExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BackupExecuted {
  readonly payload: BackupExecutedPayload;
  readonly eventName: string;

  constructor(payload: BackupExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'backup.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BackupExecuted {
    return new BackupExecuted({
      layerName: 'backup',
      executionId: executionId,
      timestamp: Date.now(),
      durationMs: durationMs,
      success: success,
      metadata: metadata,
    });
  }

  getAge(): number {
    return Date.now() - this.payload.timestamp;
  }

  toObject(): BackupExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
