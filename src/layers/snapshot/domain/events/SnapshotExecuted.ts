/**
 * SnapshotExecuted Event
 *
 * Raised when snapshot execution completes.
 */

export interface SnapshotExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SnapshotExecuted {
  readonly payload: SnapshotExecutedPayload;
  readonly eventName: string;

  constructor(payload: SnapshotExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'snapshot.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SnapshotExecuted {
    return new SnapshotExecuted({
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

  toObject(): SnapshotExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
