/**
 * Decorator Configuration Builder
 *
 * Fluent builder for decorator layer configuration.
 */

export interface DecoratorConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: string;
  strategy: string;
  options: Record<string, unknown>;
}

export class DecoratorConfigurationBuilder {
  private _enabled: boolean;
  private _timeout: number;
  private _retries: number;
  private _logLevel: string;
  private _strategy: string;
  private _options: Record<string, unknown>;

  constructor() {
    this._enabled = true;
    this._timeout = 30000;
    this._retries = 3;
    this._logLevel = 'info';
    this._strategy = 'default';
    this._options = {};
  }

  withEnabled(enabled: boolean): this {
    this._enabled = enabled;
    return this;
  }
  withTimeout(timeout: number): this {
    this._timeout = timeout;
    return this;
  }
  withRetries(retries: number): this {
    this._retries = retries;
    return this;
  }
  withLogLevel(logLevel: string): this {
    this._logLevel = logLevel;
    return this;
  }
  withStrategy(strategy: string): this {
    this._strategy = strategy;
    return this;
  }
  withOption(key: string, value: unknown): this {
    this._options[key] = value;
    return this;
  }
  withOptions(options: Record<string, unknown>): this {
    this._options = { ...this._options, ...options };
    return this;
  }

  build(): DecoratorConfiguration {
    return {
      enabled: this._enabled,
      timeout: this._timeout,
      retries: this._retries,
      logLevel: this._logLevel,
      strategy: this._strategy,
      options: { ...this._options },
    };
  }

  static default(): DecoratorConfiguration {
    return new DecoratorConfigurationBuilder().build();
  }

  static development(): DecoratorConfiguration {
    return new DecoratorConfigurationBuilder().withLogLevel('debug').withRetries(1).withTimeout(5000).build();
  }

  static production(): DecoratorConfiguration {
    return new DecoratorConfigurationBuilder().withLogLevel('warn').withRetries(5).withTimeout(60000).build();
  }
}
