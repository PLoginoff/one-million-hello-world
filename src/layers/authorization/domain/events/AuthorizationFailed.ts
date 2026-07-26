/**
 * AuthorizationFailed Event
 *
 * Raised when authorization execution fails.
 */

export interface AuthorizationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AuthorizationFailed {
  readonly payload: AuthorizationFailedPayload;
  readonly eventName: string;

  constructor(payload: AuthorizationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'authorization.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AuthorizationFailed {
    return new AuthorizationFailed({
      layerName: 'authorization',
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

  toObject(): AuthorizationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
