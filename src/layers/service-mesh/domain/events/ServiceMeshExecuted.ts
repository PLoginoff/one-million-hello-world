/**
 * ServiceMeshExecuted Event
 *
 * Raised when service-mesh execution completes.
 */

export interface ServiceMeshExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceMeshExecuted {
  readonly payload: ServiceMeshExecutedPayload;
  readonly eventName: string;

  constructor(payload: ServiceMeshExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service-mesh.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceMeshExecuted {
    return new ServiceMeshExecuted({
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

  toObject(): ServiceMeshExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
