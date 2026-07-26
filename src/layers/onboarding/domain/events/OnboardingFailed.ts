/**
 * OnboardingFailed Event
 *
 * Raised when onboarding execution fails.
 */

export interface OnboardingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class OnboardingFailed {
  readonly payload: OnboardingFailedPayload;
  readonly eventName: string;

  constructor(payload: OnboardingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'onboarding.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): OnboardingFailed {
    return new OnboardingFailed({
      layerName: 'onboarding',
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

  toObject(): OnboardingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
