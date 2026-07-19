/**
 * Vault Secrets Adapter
 *
 * Reads secrets from HashiCorp Vault (mock implementation for testing).
 */

import { ISecrets } from '../interfaces/ISecrets';
import { SecretsContext, SecretsResult } from '../types/secrets-types';

export class VaultSecretsAdapter implements ISecrets {
  private _vaultUrl: string;
  private _token: string;
  private _cache: Map<string, string>;
  private _config: Record<string, unknown>;

  constructor(vaultUrl: string = 'http://localhost:8200', token: string = '') {
    this._vaultUrl = vaultUrl;
    this._token = token;
    this._cache = new Map();
    this._config = {};
  }

  async execute(context: SecretsContext): Promise<SecretsResult<unknown>> {
    const key = String(context.input);

    if (this._cache.has(key)) {
      await Promise.resolve();
      return { success: true, data: { key, value: this._cache.get(key), source: 'vault-cache' } };
    }

    await Promise.resolve();
    return {
      success: false,
      error: { code: 'SECRET_NOT_FOUND', message: `Secret ${key} not found in Vault` },
    };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.vaultUrl === 'string') {
      this._vaultUrl = config.vaultUrl;
    }
    if (typeof config.token === 'string') {
      this._token = config.token;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'vault',
      vaultUrl: this._vaultUrl,
      connected: this._token.length > 0,
      cachedSecrets: this._cache.size,
    };
  }

  setSecret(key: string, value: string): void {
    this._cache.set(key, value);
  }

  clearCache(): void {
    this._cache.clear();
  }
}
