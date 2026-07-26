/**
 * RouterFailed Event
 *
 * Raised when router execution fails.
 */

export interface RouterFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RouterFailed {
  readonly payload: RouterFailedPayload;
  readonly eventName: string;

  constructor(payload: RouterFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'router.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RouterFailed {
    return new RouterFailed({
      layerName: 'router',
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

  toObject(): RouterFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
