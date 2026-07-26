/**
 * MessageBusFailed Event
 *
 * Raised when message-bus execution fails.
 */

export interface MessageBusFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MessageBusFailed {
  readonly payload: MessageBusFailedPayload;
  readonly eventName: string;

  constructor(payload: MessageBusFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'message-bus.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MessageBusFailed {
    return new MessageBusFailed({
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

  toObject(): MessageBusFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
