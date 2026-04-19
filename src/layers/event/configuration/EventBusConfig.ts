/**
 * EventBusConfig - Configuration
 * 
 * Configuration object for event bus and related components.
 * Provides type-safe configuration with defaults and validation.
 */

export interface EventBusConfigOptions {
  enableAsync?: boolean;
  enablePersistence?: boolean;
  maxQueueSize?: number;
  maxSubscriptions?: number;
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  logLevel?: string;
  serializationFormat?: string;
}

export class EventBusConfig {
  readonly enableAsync: boolean;
  readonly enablePersistence: boolean;
  readonly maxQueueSize: number;
  readonly maxSubscriptions: number;
  readonly timeout: number;
  readonly retryOnFailure: boolean;
  readonly maxRetries: number;
  readonly enableMetrics: boolean;
  readonly enableLogging: boolean;
  readonly logLevel: string;
  readonly serializationFormat: string;

  constructor(options: EventBusConfigOptions = {}) {
    this.enableAsync = options.enableAsync ?? true;
    this.enablePersistence = options.enablePersistence ?? false;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.maxSubscriptions = options.maxSubscriptions ?? 10000;
    this.timeout = options.timeout ?? 5000;
    this.retryOnFailure = options.retryOnFailure ?? false;
    this.maxRetries = options.maxRetries ?? 3;
    this.enableMetrics = options.enableMetrics ?? true;
    this.enableLogging = options.enableLogging ?? true;
    this.logLevel = options.logLevel ?? 'info';
    this.serializationFormat = options.serializationFormat ?? 'json';
  }

  static create(options?: EventBusConfigOptions): EventBusConfig {
    return new EventBusConfig(options);
  }

  static default(): EventBusConfig {
    return new EventBusConfig();
  }

  withOptions(options: Partial<EventBusConfigOptions>): EventBusConfig {
    return new EventBusConfig({ ...this, ...options });
  }

  toJSON(): object {
    return {
      enableAsync: this.enableAsync,
      enablePersistence: this.enablePersistence,
      maxQueueSize: this.maxQueueSize,
      maxSubscriptions: this.maxSubscriptions,
      timeout: this.timeout,
      retryOnFailure: this.retryOnFailure,
      maxRetries: this.maxRetries,
      enableMetrics: this.enableMetrics,
      enableLogging: this.enableLogging,
      logLevel: this.logLevel,
      serializationFormat: this.serializationFormat,
    };
  }

  static fromJSON(json: any): EventBusConfig {
    return new EventBusConfig(json);
  }
}
