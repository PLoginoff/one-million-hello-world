/**
 * InboxExecuted Event
 *
 * Raised when inbox execution completes.
 */

export interface InboxExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class InboxExecuted {
  readonly payload: InboxExecutedPayload;
  readonly eventName: string;

  constructor(payload: InboxExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'inbox.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): InboxExecuted {
    return new InboxExecuted({
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

  toObject(): InboxExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
