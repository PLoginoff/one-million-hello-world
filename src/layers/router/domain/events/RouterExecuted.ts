/**
 * RouterExecuted Event
 *
 * Raised when router execution completes.
 */

export interface RouterExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RouterExecuted {
  readonly payload: RouterExecutedPayload;
  readonly eventName: string;

  constructor(payload: RouterExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'router.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RouterExecuted {
    return new RouterExecuted({
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

  toObject(): RouterExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
