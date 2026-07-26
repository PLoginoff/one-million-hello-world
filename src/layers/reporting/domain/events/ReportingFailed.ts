/**
 * ReportingFailed Event
 *
 * Raised when reporting execution fails.
 */

export interface ReportingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ReportingFailed {
  readonly payload: ReportingFailedPayload;
  readonly eventName: string;

  constructor(payload: ReportingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'reporting.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ReportingFailed {
    return new ReportingFailed({
      layerName: 'reporting',
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

  toObject(): ReportingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
