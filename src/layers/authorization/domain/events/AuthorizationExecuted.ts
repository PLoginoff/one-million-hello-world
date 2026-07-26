/**
 * AuthorizationExecuted Event
 *
 * Raised when authorization execution completes.
 */

export interface AuthorizationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class AuthorizationExecuted {
  readonly payload: AuthorizationExecutedPayload;
  readonly eventName: string;

  constructor(payload: AuthorizationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'authorization.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): AuthorizationExecuted {
    return new AuthorizationExecuted({
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

  toObject(): AuthorizationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
