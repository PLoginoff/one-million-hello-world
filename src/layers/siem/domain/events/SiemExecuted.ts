/**
 * SiemExecuted Event
 *
 * Raised when siem execution completes.
 */

export interface SiemExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SiemExecuted {
  readonly payload: SiemExecutedPayload;
  readonly eventName: string;

  constructor(payload: SiemExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'siem.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SiemExecuted {
    return new SiemExecuted({
      layerName: 'siem',
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

  toObject(): SiemExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
