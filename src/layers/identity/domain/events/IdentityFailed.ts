/**
 * IdentityFailed Event
 *
 * Raised when identity execution fails.
 */

export interface IdentityFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class IdentityFailed {
  readonly payload: IdentityFailedPayload;
  readonly eventName: string;

  constructor(payload: IdentityFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'identity.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): IdentityFailed {
    return new IdentityFailed({
      layerName: 'identity',
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

  toObject(): IdentityFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
