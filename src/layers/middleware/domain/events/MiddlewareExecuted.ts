/**
 * MiddlewareExecuted Event
 *
 * Raised when middleware execution completes.
 */

export interface MiddlewareExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MiddlewareExecuted {
  readonly payload: MiddlewareExecutedPayload;
  readonly eventName: string;

  constructor(payload: MiddlewareExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'middleware.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MiddlewareExecuted {
    return new MiddlewareExecuted({
      layerName: 'middleware',
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

  toObject(): MiddlewareExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
