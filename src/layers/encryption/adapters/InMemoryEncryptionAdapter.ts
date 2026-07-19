/**
 * In-Memory Encryption Adapter
 *
 * Simple base64-based encryption for testing purposes.
 */

import { IEncryption } from '../interfaces/IEncryption';
import { EncryptionContext, EncryptionResult } from '../types/encryption-types';

export class InMemoryEncryptionAdapter implements IEncryption {
  private _keys: Map<string, string>;
  private _config: Record<string, unknown>;

  constructor() {
    this._keys = new Map();
    this._config = {};
  }

  async execute(context: EncryptionContext): Promise<EncryptionResult<unknown>> {
    const action = (context.metadata.action as string) ?? 'encrypt';
    const data = String(context.input);
    const keyId = (context.metadata.keyId as string) ?? 'default';

    if (action === 'encrypt') {
      const encrypted = Buffer.from(data).toString('base64');
      await Promise.resolve();
      return { success: true, data: { encrypted, keyId, algorithm: 'base64' } };
    }

    if (action === 'decrypt') {
      try {
        const decrypted = Buffer.from(data, 'base64').toString('utf8');
        await Promise.resolve();
        return { success: true, data: { decrypted, keyId, algorithm: 'base64' } };
      } catch {
        await Promise.resolve();
        return { success: false, error: { code: 'DECRYPT_FAILED', message: 'Failed to decrypt data' } };
      }
    }

    await Promise.resolve();
    return { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } };
  }

  configure(config: Record<string, unknown>): void {
    this._config = config;
  }

  getStatus(): Record<string, unknown> {
    return {
      adapter: 'in-memory',
      algorithm: 'base64',
      keyCount: this._keys.size,
    };
  }

  setKey(keyId: string, key: string): void {
    this._keys.set(keyId, key);
  }
}
