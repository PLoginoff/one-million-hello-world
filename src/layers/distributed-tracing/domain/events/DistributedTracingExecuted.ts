/**
 * DistributedTracingExecuted Event
 *
 * Raised when distributed-tracing execution completes.
 */

export interface DistributedTracingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DistributedTracingExecuted {
  readonly payload: DistributedTracingExecutedPayload;
  readonly eventName: string;

  constructor(payload: DistributedTracingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'distributed-tracing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DistributedTracingExecuted {
    return new DistributedTracingExecuted({
      layerName: 'distributed-tracing',
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

  toObject(): DistributedTracingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
