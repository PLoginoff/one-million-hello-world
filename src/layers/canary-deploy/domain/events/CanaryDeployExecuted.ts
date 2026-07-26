/**
 * CanaryDeployExecuted Event
 *
 * Raised when canary-deploy execution completes.
 */

export interface CanaryDeployExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CanaryDeployExecuted {
  readonly payload: CanaryDeployExecutedPayload;
  readonly eventName: string;

  constructor(payload: CanaryDeployExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'canary-deploy.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CanaryDeployExecuted {
    return new CanaryDeployExecuted({
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

  toObject(): CanaryDeployExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
