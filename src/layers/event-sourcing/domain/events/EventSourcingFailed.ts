/**
 * EventSourcingFailed Event
 *
 * Raised when event-sourcing execution fails.
 */

export interface EventSourcingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EventSourcingFailed {
  readonly payload: EventSourcingFailedPayload;
  readonly eventName: string;

  constructor(payload: EventSourcingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'event-sourcing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EventSourcingFailed {
    return new EventSourcingFailed({
      layerName: 'event-sourcing',
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

  toObject(): EventSourcingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
