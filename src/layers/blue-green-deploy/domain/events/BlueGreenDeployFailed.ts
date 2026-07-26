/**
 * BlueGreenDeployFailed Event
 *
 * Raised when blue-green-deploy execution fails.
 */

export interface BlueGreenDeployFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BlueGreenDeployFailed {
  readonly payload: BlueGreenDeployFailedPayload;
  readonly eventName: string;

  constructor(payload: BlueGreenDeployFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'blue-green-deploy.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BlueGreenDeployFailed {
    return new BlueGreenDeployFailed({
      layerName: 'blue-green-deploy',
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

  toObject(): BlueGreenDeployFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
