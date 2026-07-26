/**
 * MessageQueueFailed Event
 *
 * Raised when message-queue execution fails.
 */

export interface MessageQueueFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MessageQueueFailed {
  readonly payload: MessageQueueFailedPayload;
  readonly eventName: string;

  constructor(payload: MessageQueueFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'message-queue.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MessageQueueFailed {
    return new MessageQueueFailed({
      layerName: 'message-queue',
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

  toObject(): MessageQueueFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
