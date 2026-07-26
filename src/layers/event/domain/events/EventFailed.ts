/**
 * EventFailed Event
 *
 * Raised when event execution fails.
 */

export interface EventFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EventFailed {
  readonly payload: EventFailedPayload;
  readonly eventName: string;

  constructor(payload: EventFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'event.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EventFailed {
    return new EventFailed({
      layerName: 'event',
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

  toObject(): EventFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
