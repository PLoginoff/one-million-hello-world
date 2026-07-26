/**
 * SchedulingFailed Event
 *
 * Raised when scheduling execution fails.
 */

export interface SchedulingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SchedulingFailed {
  readonly payload: SchedulingFailedPayload;
  readonly eventName: string;

  constructor(payload: SchedulingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'scheduling.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SchedulingFailed {
    return new SchedulingFailed({
      layerName: 'scheduling',
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

  toObject(): SchedulingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
