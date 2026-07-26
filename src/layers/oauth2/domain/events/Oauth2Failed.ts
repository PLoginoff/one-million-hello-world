/**
 * Oauth2Failed Event
 *
 * Raised when oauth2 execution fails.
 */

export interface Oauth2FailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class Oauth2Failed {
  readonly payload: Oauth2FailedPayload;
  readonly eventName: string;

  constructor(payload: Oauth2FailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'oauth2.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): Oauth2Failed {
    return new Oauth2Failed({
      layerName: 'oauth2',
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

  toObject(): Oauth2FailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
