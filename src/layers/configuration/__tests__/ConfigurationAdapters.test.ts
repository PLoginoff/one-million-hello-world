import { EnvConfigAdapter } from '../adapters/EnvConfigAdapter';
import { FileConfigAdapter } from '../adapters/FileConfigAdapter';
import { ConfigurationContext } from '../types/configuration-types';

function createContext(input: unknown): ConfigurationContext {
  return { input, metadata: {}, timestamp: new Date() };
}

describe('EnvConfigAdapter', () => {
  const testKey = 'TEST_CONFIG_KEY_12345';

  beforeEach(() => {
    process.env['APP_' + testKey] = 'config-value';
  });

  afterEach(() => {
    delete process.env['APP_' + testKey];
  });

  it('should read config from env', async () => {
    const adapter = new EnvConfigAdapter('APP');
    const result = await adapter.execute(createContext(testKey.toLowerCase()));
    expect(result.success).toBe(true);
    expect((result.data as { value: string }).value).toBe('config-value');
  });

  it('should fail for missing config', async () => {
    const adapter = new EnvConfigAdapter('APP');
    const result = await adapter.execute(createContext('NONEXISTENT'));
    expect(result.success).toBe(false);
  });

  it('should return status', () => {
    const adapter = new EnvConfigAdapter('APP');
    expect(adapter.getStatus().adapter).toBe('env');
  });
});

describe('FileConfigAdapter', () => {
  let adapter: FileConfigAdapter;

  beforeEach(() => {
    adapter = new FileConfigAdapter('/etc/app/config.json');
  });

  it('should read config value', async () => {
    adapter.setValue('db.host', 'localhost');
    const result = await adapter.execute(createContext('db.host'));
    expect(result.success).toBe(true);
    expect((result.data as { value: string }).value).toBe('localhost');
  });

  it('should fail for missing config', async () => {
    const result = await adapter.execute(createContext('missing.key'));
    expect(result.success).toBe(false);
  });

  it('should configure from config object', () => {
    adapter.configure({ values: { key1: 'val1' } });
    expect(adapter.getValue('key1')).toBe('val1');
  });

  it('should clear values', () => {
    adapter.setValue('key', 'val');
    adapter.clear();
    expect(adapter.getStatus().keyCount).toBe(0);
  });

  it('should return status', () => {
    expect(adapter.getStatus().adapter).toBe('file');
  });
});
