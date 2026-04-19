/**
 * ConfigLoader Unit Tests
 * 
 * Comprehensive tests for ConfigLoader configuration.
 * Tests cover loading from different sources, environment variables, and edge cases.
 */

import { ConfigLoader } from '../../configuration/ConfigLoader';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    loader = new ConfigLoader();
  });

  afterEach(() => {
    delete process.env.EVENT_BUS_ENABLE_ASYNC;
    delete process.env.EVENT_BUS_ENABLE_PERSISTENCE;
    delete process.env.EVENT_BUS_MAX_QUEUE_SIZE;
    delete process.env.EVENT_BUS_MAX_SUBSCRIPTIONS;
    delete process.env.EVENT_BUS_TIMEOUT;
    delete process.env.EVENT_BUS_RETRY_ON_FAILURE;
    delete process.env.EVENT_BUS_MAX_RETRIES;
    delete process.env.EVENT_BUS_ENABLE_METRICS;
    delete process.env.EVENT_BUS_ENABLE_LOGGING;
    delete process.env.EVENT_BUS_LOG_LEVEL;
    delete process.env.EVENT_BUS_SERIALIZATION_FORMAT;
  });

  describe('constructor', () => {
    it('should create with default env prefix', () => {
      expect(loader).toBeDefined();
      expect(loader.getEnvPrefix()).toBe('EVENT_BUS_');
    });

    it('should create with custom env prefix', () => {
      const customLoader = new ConfigLoader('CUSTOM_');
      expect(customLoader.getEnvPrefix()).toBe('CUSTOM_');
    });
  });

  describe('load', () => {
    it('should load config from env', () => {
      const loaded = loader.load();

      expect(loaded.config).toBeDefined();
      expect(loaded.source).toBe('env');
      expect(loaded.validationResult).toBeDefined();
    });
  });

  describe('loadFromEnv', () => {
    it('should load config from environment variables', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'false';
      process.env.EVENT_BUS_MAX_QUEUE_SIZE = '500';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(false);
      expect(loaded.config.maxQueueSize).toBe(500);
    });

    it('should parse boolean env vars', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'true';
      process.env.EVENT_BUS_ENABLE_PERSISTENCE = 'false';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(true);
      expect(loaded.config.enablePersistence).toBe(false);
    });

    it('should parse number env vars', () => {
      process.env.EVENT_BUS_MAX_QUEUE_SIZE = '2000';
      process.env.EVENT_BUS_TIMEOUT = '10000';
      process.env.EVENT_BUS_MAX_RETRIES = '5';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.maxQueueSize).toBe(2000);
      expect(loaded.config.timeout).toBe(10000);
      expect(loaded.config.maxRetries).toBe(5);
    });

    it('should parse string env vars', () => {
      process.env.EVENT_BUS_LOG_LEVEL = 'debug';
      process.env.EVENT_BUS_SERIALIZATION_FORMAT = 'protobuf';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.logLevel).toBe('debug');
      expect(loaded.config.serializationFormat).toBe('protobuf');
    });

    it('should use defaults when env vars not set', () => {
      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(true);
      expect(loaded.config.maxQueueSize).toBe(1000);
    });

    it('should return source as env', () => {
      const loaded = loader.loadFromEnv();
      expect(loaded.source).toBe('env');
    });

    it('should include validation result', () => {
      const loaded = loader.loadFromEnv();
      expect(loaded.validationResult).toBeDefined();
      expect(loaded.validationResult.valid).toBe(true);
    });
  });

  describe('loadFromFile', () => {
    it('should load config from file', () => {
      const loaded = loader.loadFromFile('/path/to/config.json');

      expect(loaded.config).toBeDefined();
      expect(loaded.source).toBe('file');
    });

    it('should return source as file', () => {
      const loaded = loader.loadFromFile('/path/to/config.json');
      expect(loaded.source).toBe('file');
    });
  });

  describe('loadFromProgrammatic', () => {
    it('should load config from options', () => {
      const options = {
        enableAsync: false,
        maxQueueSize: 500,
      };

      const loaded = loader.loadFromProgrammatic(options);

      expect(loaded.config.enableAsync).toBe(false);
      expect(loaded.config.maxQueueSize).toBe(500);
    });

    it('should return source as programmatic', () => {
      const loaded = loader.loadFromProgrammatic({});
      expect(loaded.source).toBe('programmatic');
    });

    it('should include validation result', () => {
      const loaded = loader.loadFromProgrammatic({});
      expect(loaded.validationResult).toBeDefined();
    });

    it('should validate loaded config', () => {
      const options = {
        maxQueueSize: 0,
      };

      const loaded = loader.loadFromProgrammatic(options);

      expect(loaded.validationResult.valid).toBe(false);
    });
  });

  describe('loadDefault', () => {
    it('should load default config', () => {
      const loaded = loader.loadDefault();

      expect(loaded.config).toBeDefined();
      expect(loaded.source).toBe('default');
    });

    it('should return source as default', () => {
      const loaded = loader.loadDefault();
      expect(loaded.source).toBe('default');
    });

    it('should include validation result', () => {
      const loaded = loader.loadDefault();
      expect(loaded.validationResult).toBeDefined();
      expect(loaded.validationResult.valid).toBe(true);
    });

    it('should have default values', () => {
      const loaded = loader.loadDefault();

      expect(loaded.config.enableAsync).toBe(true);
      expect(loaded.config.maxQueueSize).toBe(1000);
      expect(loaded.config.timeout).toBe(5000);
    });
  });

  describe('setEnvPrefix', () => {
    it('should change env prefix', () => {
      loader.setEnvPrefix('NEW_PREFIX_');
      expect(loader.getEnvPrefix()).toBe('NEW_PREFIX_');
    });

    it('should affect subsequent env loads', () => {
      loader.setEnvPrefix('CUSTOM_');
      process.env.CUSTOM_ENABLE_ASYNC = 'false';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(false);
    });
  });

  describe('getEnvPrefix', () => {
    it('should return current env prefix', () => {
      loader.setEnvPrefix('TEST_');
      expect(loader.getEnvPrefix()).toBe('TEST_');
    });
  });

  describe('_parseEnvValue', () => {
    it('should parse true string to boolean', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'true';
      const loaded = loader.loadFromEnv();
      expect(loaded.config.enableAsync).toBe(true);
    });

    it('should parse false string to boolean', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'false';
      const loaded = loader.loadFromEnv();
      expect(loaded.config.enableAsync).toBe(false);
    });

    it('should parse number string to number', () => {
      process.env.EVENT_BUS_MAX_QUEUE_SIZE = '5000';
      const loaded = loader.loadFromEnv();
      expect(loaded.config.maxQueueSize).toBe(5000);
    });

    it('should keep string as string', () => {
      process.env.EVENT_BUS_LOG_LEVEL = 'debug';
      const loaded = loader.loadFromEnv();
      expect(loaded.config.logLevel).toBe('debug');
    });

    it('should handle invalid number string', () => {
      process.env.EVENT_BUS_MAX_QUEUE_SIZE = 'not-a-number';
      const loaded = loader.loadFromEnv();
      expect(typeof loaded.config.maxQueueSize).toBe('string');
    });
  });

  describe('edge cases', () => {
    it('should handle env var with spaces', () => {
      process.env.EVENT_BUS_LOG_LEVEL = '  debug  ';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.logLevel).toBe('  debug  ');
    });

    it('should handle env var with mixed case boolean', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'TRUE';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(true);
    });

    it('should handle env var with mixed case false', () => {
      process.env.EVENT_BUS_ENABLE_ASYNC = 'FALSE';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.enableAsync).toBe(false);
    });

    it('should handle empty string env var', () => {
      process.env.EVENT_BUS_LOG_LEVEL = '';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.logLevel).toBe('');
    });

    it('should handle very long env prefix', () => {
      loader.setEnvPrefix('A'.repeat(100) + '_');
      expect(loader.getEnvPrefix()).toBe('A'.repeat(100) + '_');
    });

    it('should handle env var with special characters', () => {
      process.env.EVENT_BUS_LOG_LEVEL = 'test-value_with_underscores';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.logLevel).toBe('test-value_with_underscores');
    });

    it('should handle unicode in env var', () => {
      process.env.EVENT_BUS_LOG_LEVEL = 'тест';

      const loaded = loader.loadFromEnv();

      expect(loaded.config.logLevel).toBe('тест');
    });

    it('should handle loading from env when no vars set', () => {
      const loaded = loader.loadFromEnv();

      expect(loaded.config).toBeDefined();
      expect(loaded.validationResult.valid).toBe(true);
    });

    it('should handle loading from programmatic with empty options', () => {
      const loaded = loader.loadFromProgrammatic({});

      expect(loaded.config).toBeDefined();
      expect(loaded.validationResult.valid).toBe(true);
    });

    it('should handle loading from programmatic with null values', () => {
      const options = {
        enableAsync: null,
        maxQueueSize: null,
      } as any;

      const loaded = loader.loadFromProgrammatic(options);

      expect(loaded.config).toBeDefined();
    });

    it('should handle loading from programmatic with invalid values', () => {
      const options = {
        maxQueueSize: -1,
        maxSubscriptions: -1,
      };

      const loaded = loader.loadFromProgrammatic(options);

      expect(loaded.validationResult.valid).toBe(false);
    });
  });
});
