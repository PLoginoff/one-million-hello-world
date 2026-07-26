/**
 * EventSourcingExecuted Event
 *
 * Raised when event-sourcing execution completes.
 */

export interface EventSourcingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EventSourcingExecuted {
  readonly payload: EventSourcingExecutedPayload;
  readonly eventName: string;

  constructor(payload: EventSourcingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'event-sourcing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EventSourcingExecuted {
    return new EventSourcingExecuted({
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

  toObject(): EventSourcingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
