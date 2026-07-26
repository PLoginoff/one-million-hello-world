/**
 * DisasterRecoveryExecuted Event
 *
 * Raised when disaster-recovery execution completes.
 */

export interface DisasterRecoveryExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DisasterRecoveryExecuted {
  readonly payload: DisasterRecoveryExecutedPayload;
  readonly eventName: string;

  constructor(payload: DisasterRecoveryExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'disaster-recovery.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DisasterRecoveryExecuted {
    return new DisasterRecoveryExecuted({
      layerName: 'disaster-recovery',
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

  toObject(): DisasterRecoveryExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
