/**
 * BackupFailed Event
 *
 * Raised when backup execution fails.
 */

export interface BackupFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BackupFailed {
  readonly payload: BackupFailedPayload;
  readonly eventName: string;

  constructor(payload: BackupFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'backup.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BackupFailed {
    return new BackupFailed({
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

  toObject(): BackupFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
