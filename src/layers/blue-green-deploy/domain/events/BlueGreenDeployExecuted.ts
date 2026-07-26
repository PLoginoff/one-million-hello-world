/**
 * BlueGreenDeployExecuted Event
 *
 * Raised when blue-green-deploy execution completes.
 */

export interface BlueGreenDeployExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BlueGreenDeployExecuted {
  readonly payload: BlueGreenDeployExecutedPayload;
  readonly eventName: string;

  constructor(payload: BlueGreenDeployExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'blue-green-deploy.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BlueGreenDeployExecuted {
    return new BlueGreenDeployExecuted({
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

  toObject(): BlueGreenDeployExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
