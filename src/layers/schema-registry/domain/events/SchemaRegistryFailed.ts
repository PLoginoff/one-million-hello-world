/**
 * SchemaRegistryFailed Event
 *
 * Raised when schema-registry execution fails.
 */

export interface SchemaRegistryFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SchemaRegistryFailed {
  readonly payload: SchemaRegistryFailedPayload;
  readonly eventName: string;

  constructor(payload: SchemaRegistryFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'schema-registry.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SchemaRegistryFailed {
    return new SchemaRegistryFailed({
      layerName: 'schema-registry',
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

  toObject(): SchemaRegistryFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
