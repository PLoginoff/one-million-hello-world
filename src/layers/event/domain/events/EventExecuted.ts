/**
 * EventExecuted Event
 *
 * Raised when event execution completes.
 */

export interface EventExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EventExecuted {
  readonly payload: EventExecutedPayload;
  readonly eventName: string;

  constructor(payload: EventExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'event.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EventExecuted {
    return new EventExecuted({
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

  toObject(): EventExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
