/**
 * MessageBusExecuted Event
 *
 * Raised when message-bus execution completes.
 */

export interface MessageBusExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MessageBusExecuted {
  readonly payload: MessageBusExecutedPayload;
  readonly eventName: string;

  constructor(payload: MessageBusExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'message-bus.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MessageBusExecuted {
    return new MessageBusExecuted({
      layerName: 'message-bus',
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

  toObject(): MessageBusExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
