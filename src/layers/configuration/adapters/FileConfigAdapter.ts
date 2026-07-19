/**
 * File Configuration Adapter
 *
 * Reads configuration from an in-memory file map (for testing).
 */

import { IConfiguration } from '../interfaces/IConfiguration';
import { ConfigurationContext, ConfigurationResult } from '../types/configuration-types';

export class FileConfigAdapter implements IConfiguration {
  private _values: Map<string, unknown>;
  private _filePath: string;
  private _config: Record<string, unknown>;

  constructor(filePath: string = '/etc/app/config.json') {
    this._values = new Map();
    this._filePath = filePath;
    this._config = {};
  }

  async execute(context: ConfigurationContext): Promise<ConfigurationResult<unknown>> {
    const key = String(context.input);

    if (!this._values.has(key)) {
      await Promise.resolve();
      return { success: false, error: { code: 'CONFIG_NOT_FOUND', message: `Config ${key} not found` } };
    }

    await Promise.resolve();
    return { success: true, data: { key, value: this._values.get(key), source: 'file' } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.filePath === 'string') {
      this._filePath = config.filePath;
    }
    if (config.values !== undefined && config.values !== null && typeof config.values === 'object') {
      for (const [k, v] of Object.entries(config.values)) {
        this._values.set(k, v);
      }
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'file',
      filePath: this._filePath,
      keyCount: this._values.size,
    };
  }

  setValue(key: string, value: unknown): void {
    this._values.set(key, value);
  }

  getValue(key: string): unknown {
    return this._values.get(key);
  }

  clear(): void {
    this._values.clear();
  }
}
