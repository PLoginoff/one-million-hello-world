/**
 * PerformanceTestingFailed Event
 *
 * Raised when performance-testing execution fails.
 */

export interface PerformanceTestingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PerformanceTestingFailed {
  readonly payload: PerformanceTestingFailedPayload;
  readonly eventName: string;

  constructor(payload: PerformanceTestingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'performance-testing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PerformanceTestingFailed {
    return new PerformanceTestingFailed({
      layerName: 'performance-testing',
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

  toObject(): PerformanceTestingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
