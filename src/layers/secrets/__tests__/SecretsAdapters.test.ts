import { EnvSecretsAdapter } from '../adapters/EnvSecretsAdapter';
import { VaultSecretsAdapter } from '../adapters/VaultSecretsAdapter';
import { SecretsContext } from '../types/secrets-types';

function createContext(input: unknown): SecretsContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('EnvSecretsAdapter', () => {
  let adapter: EnvSecretsAdapter;
  const testKey = 'TEST_SECRET_KEY_12345';

  beforeEach(() => {
    process.env[testKey] = 'test-value';
    adapter = new EnvSecretsAdapter();
  });

  afterEach(() => {
    delete process.env[testKey];
  });

  it('should read secret from env', async () => {
    const result = await adapter.execute(createContext(testKey));
    expect(result.success).toBe(true);
    expect((result.data as { value: string }).value).toBe('test-value');
  });

  it('should fail for missing secret', async () => {
    const result = await adapter.execute(createContext('NONEXISTENT_KEY'));
    expect(result.success).toBe(false);
  });

  it('should support prefix', async () => {
    process.env['APP_DB_PASSWORD'] = 'db-pass';
    adapter.configure({ prefix: 'APP' });
    const result = await adapter.execute(createContext('db_password'));
    expect(result.success).toBe(true);
    delete process.env['APP_DB_PASSWORD'];
  });

  it('should return status', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('env');
  });
});

describe('VaultSecretsAdapter', () => {
  let adapter: VaultSecretsAdapter;

  beforeEach(() => {
    adapter = new VaultSecretsAdapter('http://vault:8200', 'test-token');
  });

  it('should return cached secret', async () => {
    adapter.setSecret('api-key', 'vault-value');
    const result = await adapter.execute(createContext('api-key'));
    expect(result.success).toBe(true);
    expect((result.data as { value: string }).value).toBe('vault-value');
  });

  it('should fail for uncached secret', async () => {
    const result = await adapter.execute(createContext('missing'));
    expect(result.success).toBe(false);
  });

  it('should clear cache', () => {
    adapter.setSecret('key', 'val');
    adapter.clearCache();
    expect(adapter.getStatus().cachedSecrets).toBe(0);
  });

  it('should return status with vault URL', () => {
    const status = adapter.getStatus();
    expect(status.adapter).toBe('vault');
    expect(status.vaultUrl).toBe('http://vault:8200');
  });
});
