/**
 * PerformanceTestingExecuted Event
 *
 * Raised when performance-testing execution completes.
 */

export interface PerformanceTestingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class PerformanceTestingExecuted {
  readonly payload: PerformanceTestingExecutedPayload;
  readonly eventName: string;

  constructor(payload: PerformanceTestingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'performance-testing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): PerformanceTestingExecuted {
    return new PerformanceTestingExecuted({
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

  toObject(): PerformanceTestingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
