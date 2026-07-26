/**
 * SnapshotFailed Event
 *
 * Raised when snapshot execution fails.
 */

export interface SnapshotFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SnapshotFailed {
  readonly payload: SnapshotFailedPayload;
  readonly eventName: string;

  constructor(payload: SnapshotFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'snapshot.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SnapshotFailed {
    return new SnapshotFailed({
      layerName: 'snapshot',
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

  toObject(): SnapshotFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
