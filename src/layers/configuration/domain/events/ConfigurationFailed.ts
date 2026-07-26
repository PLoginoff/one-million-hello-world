/**
 * ConfigurationFailed Event
 *
 * Raised when configuration execution fails.
 */

export interface ConfigurationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ConfigurationFailed {
  readonly payload: ConfigurationFailedPayload;
  readonly eventName: string;

  constructor(payload: ConfigurationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'configuration.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ConfigurationFailed {
    return new ConfigurationFailed({
      layerName: 'configuration',
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

  toObject(): ConfigurationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
