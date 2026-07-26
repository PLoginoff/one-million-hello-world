/**
 * InboxFailed Event
 *
 * Raised when inbox execution fails.
 */

export interface InboxFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class InboxFailed {
  readonly payload: InboxFailedPayload;
  readonly eventName: string;

  constructor(payload: InboxFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'inbox.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): InboxFailed {
    return new InboxFailed({
      layerName: 'inbox',
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

  toObject(): InboxFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
