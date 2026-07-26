/**
 * ServiceDiscoveryExecuted Event
 *
 * Raised when service-discovery execution completes.
 */

export interface ServiceDiscoveryExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceDiscoveryExecuted {
  readonly payload: ServiceDiscoveryExecutedPayload;
  readonly eventName: string;

  constructor(payload: ServiceDiscoveryExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service-discovery.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceDiscoveryExecuted {
    return new ServiceDiscoveryExecuted({
      layerName: 'service-discovery',
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

  toObject(): ServiceDiscoveryExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
