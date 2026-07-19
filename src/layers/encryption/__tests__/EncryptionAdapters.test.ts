import { InMemoryEncryptionAdapter } from '../adapters/InMemoryEncryptionAdapter';
import { KmsEncryptionAdapter } from '../adapters/KmsEncryptionAdapter';
import { EncryptionContext } from '../types/encryption-types';

function createContext(input: unknown, metadata: Record<string, unknown> = {}): EncryptionContext {
  return { input, metadata, timestamp: new Date() };
}

describe('InMemoryEncryptionAdapter', () => {
  let adapter: InMemoryEncryptionAdapter;

  beforeEach(() => {
    adapter = new InMemoryEncryptionAdapter();
  });

  it('should encrypt data', async () => {
    const result = await adapter.execute(createContext('secret-data', { action: 'encrypt' }));
    expect(result.success).toBe(true);
    expect((result.data as { encrypted: string }).encrypted).toBeDefined();
  });

  it('should decrypt data', async () => {
    const encResult = await adapter.execute(createContext('secret-data', { action: 'encrypt' }));
    const encrypted = (encResult.data as { encrypted: string }).encrypted;
    const decResult = await adapter.execute(createContext(encrypted, { action: 'decrypt' }));
    expect(decResult.success).toBe(true);
    expect((decResult.data as { decrypted: string }).decrypted).toBe('secret-data');
  });

  it('should fail for unknown action', async () => {
    const result = await adapter.execute(createContext('data', { action: 'unknown' }));
    expect(result.success).toBe(false);
  });

  it('should return status', () => {
    expect(adapter.getStatus().adapter).toBe('in-memory');
  });
});

describe('KmsEncryptionAdapter', () => {
  let adapter: KmsEncryptionAdapter;

  beforeEach(() => {
    adapter = new KmsEncryptionAdapter('alias/app-key', 'us-east-1');
  });

  it('should encrypt with KMS prefix', async () => {
    const result = await adapter.execute(createContext('data', { action: 'encrypt' }));
    expect(result.success).toBe(true);
    const encrypted = (result.data as { encrypted: string }).encrypted;
    expect(encrypted.startsWith('kms:')).toBe(true);
  });

  it('should decrypt KMS-encrypted data', async () => {
    const encResult = await adapter.execute(createContext('data', { action: 'encrypt' }));
    const encrypted = (encResult.data as { encrypted: string }).encrypted;
    const decResult = await adapter.execute(createContext(encrypted, { action: 'decrypt' }));
    expect(decResult.success).toBe(true);
    expect((decResult.data as { decrypted: string }).decrypted).toBe('data');
  });

  it('should reject non-KMS data for decrypt', async () => {
    const result = await adapter.execute(createContext('not-kms-encrypted', { action: 'decrypt' }));
    expect(result.success).toBe(false);
  });

  it('should return status with KMS info', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('kms');
    expect(status.kmsKeyId).toBe('alias/app-key');
  });
});
