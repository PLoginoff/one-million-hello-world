/**
 * KMS Encryption Adapter
 *
 * Mock KMS encryption adapter for testing (simulates AWS KMS / Google KMS).
 */

import { IEncryption } from '../interfaces/IEncryption';
import { EncryptionContext, EncryptionResult } from '../types/encryption-types';

export class KmsEncryptionAdapter implements IEncryption {
  private _kmsKeyId: string;
  private _kmsRegion: string;
  private _cache: Map<string, string>;
  private _config: Record<string, unknown>;

  constructor(kmsKeyId: string = 'alias/app-key', kmsRegion: string = 'us-east-1') {
    this._kmsKeyId = kmsKeyId;
    this._kmsRegion = kmsRegion;
    this._cache = new Map();
    this._config = {};
  }

  async execute(context: EncryptionContext): Promise<EncryptionResult<unknown>> {
    const action = (context.metadata.action as string) ?? 'encrypt';
    const data = String(context.input);

    if (action === 'encrypt') {
      const encrypted = `kms:${this._kmsKeyId}:${Buffer.from(data).toString('base64')}`;
      const cacheKey = Buffer.from(data).toString('base64');
      this._cache.set(cacheKey, encrypted);
      await Promise.resolve();
      return { success: true, data: { encrypted, keyId: this._kmsKeyId, algorithm: 'kms' } };
    }

    if (action === 'decrypt') {
      if (data.startsWith('kms:')) {
        const parts = data.split(':');
        const encoded = parts[2];
        try {
          const decrypted = Buffer.from(encoded, 'base64').toString('utf8');
          await Promise.resolve();
          return { success: true, data: { decrypted, keyId: this._kmsKeyId, algorithm: 'kms' } };
        } catch {
          await Promise.resolve();
          return { success: false, error: { code: 'DECRYPT_FAILED', message: 'Failed to decrypt KMS data' } };
        }
      }
      await Promise.resolve();
      return { success: false, error: { code: 'INVALID_FORMAT', message: 'Data is not KMS-encrypted' } };
    }

    await Promise.resolve();
    return { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
    if (typeof config.kmsKeyId === 'string') {
      this._kmsKeyId = config.kmsKeyId;
    }
    if (typeof config.kmsRegion === 'string') {
      this._kmsRegion = config.kmsRegion;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'kms',
      kmsKeyId: this._kmsKeyId,
      kmsRegion: this._kmsRegion,
      cachedEntries: this._cache.size,
    };
  }
}
