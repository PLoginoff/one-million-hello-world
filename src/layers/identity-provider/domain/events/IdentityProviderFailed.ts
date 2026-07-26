/**
 * IdentityProviderFailed Event
 *
 * Raised when identity-provider execution fails.
 */

export interface IdentityProviderFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class IdentityProviderFailed {
  readonly payload: IdentityProviderFailedPayload;
  readonly eventName: string;

  constructor(payload: IdentityProviderFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'identity-provider.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): IdentityProviderFailed {
    return new IdentityProviderFailed({
      layerName: 'identity-provider',
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

  toObject(): IdentityProviderFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
