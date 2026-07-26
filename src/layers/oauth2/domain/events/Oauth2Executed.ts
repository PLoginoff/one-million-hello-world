/**
 * Oauth2Executed Event
 *
 * Raised when oauth2 execution completes.
 */

export interface Oauth2ExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class Oauth2Executed {
  readonly payload: Oauth2ExecutedPayload;
  readonly eventName: string;

  constructor(payload: Oauth2ExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'oauth2.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): Oauth2Executed {
    return new Oauth2Executed({
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

  toObject(): Oauth2ExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
