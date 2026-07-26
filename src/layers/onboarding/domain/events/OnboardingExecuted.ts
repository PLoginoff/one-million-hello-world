/**
 * OnboardingExecuted Event
 *
 * Raised when onboarding execution completes.
 */

export interface OnboardingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class OnboardingExecuted {
  readonly payload: OnboardingExecutedPayload;
  readonly eventName: string;

  constructor(payload: OnboardingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'onboarding.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): OnboardingExecuted {
    return new OnboardingExecuted({
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

  toObject(): OnboardingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
