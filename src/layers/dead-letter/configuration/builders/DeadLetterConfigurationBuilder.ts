/**
 * DeadLetter Configuration Builder
 *
 * Fluent builder for dead-letter layer configuration.
 */

import { DeadLetterConfiguration } from '../../types/dead-letter-types';

export class DeadLetterConfigurationBuilder {
  private _enabled: boolean;
  private _timeout: number;
  private _retries: number;
  private _logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
  private _strategy: string;
  private _options: Record<string, unknown>;
  private _maxQueueSize: number;
  private _retentionDays: number;
  private _enableRetry: boolean;
  private _enableReplay: boolean;
  private _enableMetrics: boolean;

  constructor() {
    this._enabled = true;
    this._timeout = 30000;
    this._retries = 3;
    this._strategy = 'default';
    this._options = {};
    this._maxQueueSize = 10000;
    this._retentionDays = 30;
    this._enableRetry = true;
    this._enableReplay = true;
    this._enableMetrics = true;
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
  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): this {
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
  withMaxQueueSize(maxQueueSize: number): this {
    this._maxQueueSize = maxQueueSize;
    return this;
  }
  withRetentionDays(retentionDays: number): this {
    this._retentionDays = retentionDays;
    return this;
  }
  withEnableRetry(enableRetry: boolean): this {
    this._enableRetry = enableRetry;
    return this;
  }
  withEnableReplay(enableReplay: boolean): this {
    this._enableReplay = enableReplay;
    return this;
  }
  withEnableMetrics(enableMetrics: boolean): this {
    this._enableMetrics = enableMetrics;
    return this;
  }

  build(): DeadLetterConfiguration {
    return {
      enabled: this._enabled,
      timeout: this._timeout,
      retries: this._retries,
      logLevel: this._logLevel,
      strategy: this._strategy,
      options: { ...this._options },
      maxQueueSize: this._maxQueueSize,
      retentionDays: this._retentionDays,
      enableRetry: this._enableRetry,
      enableReplay: this._enableReplay,
      enableMetrics: this._enableMetrics,
    };
  }

  static default(): DeadLetterConfiguration {
    return new DeadLetterConfigurationBuilder().build();
  }

  static development(): DeadLetterConfiguration {
    return new DeadLetterConfigurationBuilder()
      .withLogLevel('debug')
      .withRetries(1)
      .withTimeout(5000)
      .withMaxQueueSize(1000)
      .withRetentionDays(7)
      .build();
  }

  static production(): DeadLetterConfiguration {
    return new DeadLetterConfigurationBuilder()
      .withLogLevel('warn')
      .withRetries(5)
      .withTimeout(60000)
      .withMaxQueueSize(50000)
      .withRetentionDays(90)
      .build();
  }
}