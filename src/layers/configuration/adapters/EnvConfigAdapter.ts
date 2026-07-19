/**
 * Environment Configuration Adapter
 *
 * Reads configuration values from environment variables.
 */

import { IConfiguration } from '../interfaces/IConfiguration';
import { ConfigurationContext, ConfigurationResult } from '../types/configuration-types';

export class EnvConfigAdapter implements IConfiguration {
  private _prefix: string;
  private _config: Record<string, unknown>;

  constructor(prefix: string = 'APP') {
    this._prefix = prefix;
    this._config = {};
  }

  async execute(context: ConfigurationContext): Promise<ConfigurationResult<unknown>> {
    const key = String(context.input);
    const envKey = this._prefix ? `${this._prefix}_${key.toUpperCase()}` : key.toUpperCase();
    const value = process.env[envKey];

    if (value === undefined) {
      await Promise.resolve();
      return {
        success: false,
        error: { code: 'CONFIG_NOT_FOUND', message: `Config ${envKey} not found in environment` },
      };
    }

    await Promise.resolve();
    return { success: true, data: { key, value, source: 'env' } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.prefix === 'string') {
      this._prefix = config.prefix;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'env',
      prefix: this._prefix,
      availableKeys: Object.keys(process.env).filter((k) => k.startsWith(this._prefix + '_')).length,
    };
  }

  getValue(key: string): string | undefined {
    const envKey = this._prefix ? `${this._prefix}_${key.toUpperCase()}` : key.toUpperCase();
    return process.env[envKey];
  }
}
