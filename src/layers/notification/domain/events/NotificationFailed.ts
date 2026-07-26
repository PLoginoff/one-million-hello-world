/**
 * NotificationFailed Event
 *
 * Raised when notification execution fails.
 */

export interface NotificationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class NotificationFailed {
  readonly payload: NotificationFailedPayload;
  readonly eventName: string;

  constructor(payload: NotificationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'notification.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): NotificationFailed {
    return new NotificationFailed({
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

  toObject(): NotificationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
