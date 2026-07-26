/**
 * SchemaRegistryExecuted Event
 *
 * Raised when schema-registry execution completes.
 */

export interface SchemaRegistryExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SchemaRegistryExecuted {
  readonly payload: SchemaRegistryExecutedPayload;
  readonly eventName: string;

  constructor(payload: SchemaRegistryExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'schema-registry.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SchemaRegistryExecuted {
    return new SchemaRegistryExecuted({
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

  toObject(): SchemaRegistryExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
