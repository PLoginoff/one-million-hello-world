/**
 * ServiceDiscoveryFailed Event
 *
 * Raised when service-discovery execution fails.
 */

export interface ServiceDiscoveryFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceDiscoveryFailed {
  readonly payload: ServiceDiscoveryFailedPayload;
  readonly eventName: string;

  constructor(payload: ServiceDiscoveryFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service-discovery.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceDiscoveryFailed {
    return new ServiceDiscoveryFailed({
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

  toObject(): ServiceDiscoveryFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
