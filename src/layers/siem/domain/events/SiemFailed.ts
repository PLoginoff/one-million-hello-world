/**
 * SiemFailed Event
 *
 * Raised when siem execution fails.
 */

export interface SiemFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SiemFailed {
  readonly payload: SiemFailedPayload;
  readonly eventName: string;

  constructor(payload: SiemFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'siem.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SiemFailed {
    return new SiemFailed({
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

  toObject(): SiemFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
