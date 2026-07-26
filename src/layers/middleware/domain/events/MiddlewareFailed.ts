/**
 * MiddlewareFailed Event
 *
 * Raised when middleware execution fails.
 */

export interface MiddlewareFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MiddlewareFailed {
  readonly payload: MiddlewareFailedPayload;
  readonly eventName: string;

  constructor(payload: MiddlewareFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'middleware.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MiddlewareFailed {
    return new MiddlewareFailed({
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

  toObject(): MiddlewareFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
