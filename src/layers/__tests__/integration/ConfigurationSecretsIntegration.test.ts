/**
 * Integration test: Configuration → Secrets
 * Verifies that configuration can reference secrets
 */

import { FileConfigAdapter } from '../../configuration/adapters/FileConfigAdapter';
import { EnvSecretsAdapter } from '../../secrets/adapters/EnvSecretsAdapter';

describe('Configuration → Secrets Integration', () => {
  const testKey = 'TEST_CONFIG_SECRET_12345';

  beforeEach(() => {
    process.env[testKey] = 'secret-from-env';
  });

  afterEach(() => {
    delete process.env[testKey];
  });

  it('should resolve configuration that references secrets', async () => {
    const config = new FileConfigAdapter();
    const secrets = new EnvSecretsAdapter();

    config.setValue('db.password', 'ref:TEST_CONFIG_SECRET_12345');

    const configResult = await config.execute({ input: 'db.password', metadata: {}, timestamp: new Date() });
    expect(configResult.success).toBe(true);

    const configValue = (configResult.data as { value: string }).value as string;
    if (configValue.startsWith('ref:')) {
      const secretKey = configValue.substring(4);
      const secretResult = await secrets.execute({ input: secretKey, metadata: {}, timestamp: new Date() });
      expect(secretResult.success).toBe(true);
      expect((secretResult.data as { value: string }).value).toBe('secret-from-env');
    }
  });

  it('should return direct config values without secret lookup', async () => {
    const config = new FileConfigAdapter();
    config.setValue('app.name', 'my-app');

    const result = await config.execute({ input: 'app.name', metadata: {}, timestamp: new Date() });
    expect(result.success).toBe(true);
    expect((result.data as { value: string }).value).toBe('my-app');
  });
});
