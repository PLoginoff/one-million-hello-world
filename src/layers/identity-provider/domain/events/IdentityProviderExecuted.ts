/**
 * IdentityProviderExecuted Event
 *
 * Raised when identity-provider execution completes.
 */

export interface IdentityProviderExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class IdentityProviderExecuted {
  readonly payload: IdentityProviderExecutedPayload;
  readonly eventName: string;

  constructor(payload: IdentityProviderExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'identity-provider.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): IdentityProviderExecuted {
    return new IdentityProviderExecuted({
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

  toObject(): IdentityProviderExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
