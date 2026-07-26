/**
 * SsoFailed Event
 *
 * Raised when sso execution fails.
 */

export interface SsoFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SsoFailed {
  readonly payload: SsoFailedPayload;
  readonly eventName: string;

  constructor(payload: SsoFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'sso.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SsoFailed {
    return new SsoFailed({
      layerName: 'sso',
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

  toObject(): SsoFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
