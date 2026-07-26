/**
 * CanaryDeployFailed Event
 *
 * Raised when canary-deploy execution fails.
 */

export interface CanaryDeployFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CanaryDeployFailed {
  readonly payload: CanaryDeployFailedPayload;
  readonly eventName: string;

  constructor(payload: CanaryDeployFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'canary-deploy.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CanaryDeployFailed {
    return new CanaryDeployFailed({
      layerName: 'canary-deploy',
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

  toObject(): CanaryDeployFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
