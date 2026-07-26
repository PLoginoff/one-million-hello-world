/**
 * NotificationExecuted Event
 *
 * Raised when notification execution completes.
 */

export interface NotificationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class NotificationExecuted {
  readonly payload: NotificationExecutedPayload;
  readonly eventName: string;

  constructor(payload: NotificationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'notification.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): NotificationExecuted {
    return new NotificationExecuted({
      layerName: 'notification',
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

  toObject(): NotificationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
