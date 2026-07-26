/**
 * MessageQueueExecuted Event
 *
 * Raised when message-queue execution completes.
 */

export interface MessageQueueExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MessageQueueExecuted {
  readonly payload: MessageQueueExecutedPayload;
  readonly eventName: string;

  constructor(payload: MessageQueueExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'message-queue.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MessageQueueExecuted {
    return new MessageQueueExecuted({
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

  toObject(): MessageQueueExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
