/**
 * SchedulingExecuted Event
 *
 * Raised when scheduling execution completes.
 */

export interface SchedulingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SchedulingExecuted {
  readonly payload: SchedulingExecutedPayload;
  readonly eventName: string;

  constructor(payload: SchedulingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'scheduling.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SchedulingExecuted {
    return new SchedulingExecuted({
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

  toObject(): SchedulingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
