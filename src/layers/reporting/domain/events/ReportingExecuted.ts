/**
 * ReportingExecuted Event
 *
 * Raised when reporting execution completes.
 */

export interface ReportingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ReportingExecuted {
  readonly payload: ReportingExecutedPayload;
  readonly eventName: string;

  constructor(payload: ReportingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'reporting.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ReportingExecuted {
    return new ReportingExecuted({
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

  toObject(): ReportingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
