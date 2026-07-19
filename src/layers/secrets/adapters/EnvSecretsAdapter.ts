/**
 * Environment Variables Secrets Adapter
 *
 * Reads secrets from environment variables.
 */

import { ISecrets } from '../interfaces/ISecrets';
import { SecretsContext, SecretsResult } from '../types/secrets-types';

export class EnvSecretsAdapter implements ISecrets {
  private _prefix: string;
  private _config: Record<string, unknown>;

  constructor(prefix: string = '') {
    this._prefix = prefix;
    this._config = {};
  }

  async execute(context: SecretsContext): Promise<SecretsResult<unknown>> {
    const key = String(context.input);
    const envKey = this._prefix ? `${this._prefix}_${key.toUpperCase()}` : key.toUpperCase();
    const value = process.env[envKey];

    if (value === undefined) {
      await Promise.resolve();
      return {
        success: false,
        error: { code: 'SECRET_NOT_FOUND', message: `Secret ${envKey} not found in environment` },
      };
    }

    await Promise.resolve();
    return { success: true, data: { key, value } };
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
      availableKeys: Object.keys(process.env).filter((k) => !this._prefix || k.startsWith(this._prefix + '_')).length,
    };
  }

  getSecret(key: string): string | undefined {
    const envKey = this._prefix ? `${this._prefix}_${key.toUpperCase()}` : key.toUpperCase();
    return process.env[envKey];
  }
}
