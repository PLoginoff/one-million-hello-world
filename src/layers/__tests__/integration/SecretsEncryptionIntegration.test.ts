/**
 * Integration test: Secrets → Encryption
 * Verifies that secrets can be encrypted/decrypted
 */

import { EnvSecretsAdapter } from '../../secrets/adapters/EnvSecretsAdapter';
import { InMemoryEncryptionAdapter } from '../../encryption/adapters/InMemoryEncryptionAdapter';
import { EncryptionContext } from '../../encryption/types/encryption-types';

describe('Secrets → Encryption Integration', () => {
  const testKey = 'TEST_SECRET_ENC_KEY_12345';

  beforeEach(() => {
    process.env[testKey] = 'my-secret-value';
  });

  afterEach(() => {
    delete process.env[testKey];
  });

  it('should retrieve secret then encrypt it', async () => {
    const secrets = new EnvSecretsAdapter();
    const encryption = new InMemoryEncryptionAdapter();

    const secretResult = await secrets.execute({ input: testKey, metadata: {}, timestamp: new Date() });
    expect(secretResult.success).toBe(true);

    const secretValue = (secretResult.data as { value: string }).value;
    const encContext: EncryptionContext = {
      input: secretValue,
      metadata: { action: 'encrypt', keyId: 'default' },
      timestamp: new Date(),
    };
    const encResult = await encryption.execute(encContext);
    expect(encResult.success).toBe(true);

    const encrypted = (encResult.data as { encrypted: string }).encrypted;
    const decContext: EncryptionContext = {
      input: encrypted,
      metadata: { action: 'decrypt', keyId: 'default' },
      timestamp: new Date(),
    };
    const decResult = await encryption.execute(decContext);
    expect(decResult.success).toBe(true);
    expect((decResult.data as { decrypted: string }).decrypted).toBe(secretValue);
  });

  it('should handle missing secret gracefully', async () => {
    const secrets = new EnvSecretsAdapter();
    const result = await secrets.execute({ input: 'NONEXISTENT_KEY', metadata: {}, timestamp: new Date() });
    expect(result.success).toBe(false);
  });
});
