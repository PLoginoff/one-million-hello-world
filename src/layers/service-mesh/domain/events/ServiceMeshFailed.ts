/**
 * ServiceMeshFailed Event
 *
 * Raised when service-mesh execution fails.
 */

export interface ServiceMeshFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceMeshFailed {
  readonly payload: ServiceMeshFailedPayload;
  readonly eventName: string;

  constructor(payload: ServiceMeshFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service-mesh.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceMeshFailed {
    return new ServiceMeshFailed({
      layerName: 'service-mesh',
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

  toObject(): ServiceMeshFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
