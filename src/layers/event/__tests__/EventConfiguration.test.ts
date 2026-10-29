/**
 * Configuration tests for Event layer
 */

import { EventConfigBuilder } from '../configuration/builders/EventConfigBuilder';
import { EventConfigValidator } from '../configuration/validators/EventConfigValidator';
import { EventBusConfig } from '../configuration/EventBusConfig';
import { ConfigLoader } from '../configuration/ConfigLoader';
import { ConfigValidator } from '../configuration/ConfigValidator';
import {
  DEFAULT_EVENT_BUS_CONFIG,
  EVENT_CONFIG_LIMITS,
  VALID_LOG_LEVELS,
  VALID_SERIALIZATION_FORMATS,
  VALID_ADAPTER_TYPES,
  VALID_STRATEGY_NAMES,
  VALID_PROFILES,
} from '../configuration/defaults/EventDefaults';

describe('EventConfigBuilder', () => {
  it('should build default configuration', () => {
    const config = new EventConfigBuilder().build();
    expect(config.eventBus.enableAsync).toBe(true);
    expect(config.eventBus.enablePersistence).toBe(false);
    expect(config.adapter.type).toBe('memory');
    expect(config.strategy.name).toBe('default');
  });

  it('should chain builder methods', () => {
    const config = new EventConfigBuilder()
      .enableAsync(false)
      .enablePersistence(true)
      .maxQueueSize(5000)
      .maxSubscriptions(10000)
      .timeout(10000)
      .retryOnFailure(true)
      .maxRetries(5)
      .enableMetrics(false)
      .enableLogging(false)
      .logLevel('debug')
      .build();
    expect(config.eventBus.enableAsync).toBe(false);
    expect(config.eventBus.enablePersistence).toBe(true);
    expect(config.eventBus.maxQueueSize).toBe(5000);
    expect(config.eventBus.maxSubscriptions).toBe(10000);
    expect(config.eventBus.timeout).toBe(10000);
    expect(config.eventBus.retryOnFailure).toBe(true);
    expect(config.eventBus.maxRetries).toBe(5);
    expect(config.metrics.enabled).toBe(false);
    expect(config.logging.enabled).toBe(false);
    expect(config.logging.level).toBe('debug');
  });

  it('should create development preset', () => {
    const config = EventConfigBuilder.development();
    expect(config.eventBus.logLevel).toBe('debug');
    expect(config.eventBus.maxRetries).toBe(1);
    expect(config.adapter.type).toBe('memory');
  });

  it('should create testing preset', () => {
    const config = EventConfigBuilder.testing();
    expect(config.eventBus.logLevel).toBe('error');
    expect(config.eventBus.maxRetries).toBe(0);
    expect(config.metrics.enabled).toBe(false);
  });

  it('should create staging preset', () => {
    const config = EventConfigBuilder.staging();
    expect(config.eventBus.logLevel).toBe('info');
    expect(config.adapter.type).toBe('redis');
  });

  it('should create production preset', () => {
    const config = EventConfigBuilder.production();
    expect(config.eventBus.logLevel).toBe('warn');
    expect(config.eventBus.maxRetries).toBe(5);
    expect(config.adapter.type).toBe('redis');
  });

  it('should create high-throughput preset', () => {
    const config = EventConfigBuilder.highThroughput();
    expect(config.eventBus.maxQueueSize).toBe(100000);
    expect(config.adapter.type).toBe('kafka');
    expect(config.strategy.name).toBe('batch');
  });

  it('should create low-latency preset', () => {
    const config = EventConfigBuilder.lowLatency();
    expect(config.eventBus.timeout).toBe(1000);
    expect(config.eventBus.maxRetries).toBe(0);
    expect(config.adapter.type).toBe('memory');
    expect(config.strategy.name).toBe('fast');
  });

  it('should create reliable preset', () => {
    const config = EventConfigBuilder.reliable();
    expect(config.eventBus.maxRetries).toBe(10);
    expect(config.eventBus.timeout).toBe(60000);
    expect(config.adapter.type).toBe('redis');
    expect(config.strategy.name).toBe('reliable');
  });

  it('should configure adapter', () => {
    const config = new EventConfigBuilder()
      .redisAdapter({ host: 'redis-host', port: 6380 })
      .build();
    expect(config.adapter.type).toBe('redis');
    expect(config.adapter.config.host).toBe('redis-host');
    expect(config.adapter.config.port).toBe(6380);
  });

  it('should configure strategy', () => {
    const config = new EventConfigBuilder()
      .reliableStrategy({ maxRetries: 10 })
      .build();
    expect(config.strategy.name).toBe('reliable');
    expect(config.strategy.config.maxRetries).toBe(10);
  });

  it('should build EventBusConfig', () => {
    const builder = new EventConfigBuilder().timeout(5000).maxRetries(3);
    const eventBusConfig = builder.buildEventBusConfig();
    expect(eventBusConfig.timeout).toBe(5000);
    expect(eventBusConfig.maxRetries).toBe(3);
  });
});

describe('EventBusConfig', () => {
  it('should create with defaults', () => {
    const config = new EventBusConfig();
    expect(config.enableAsync).toBe(true);
    expect(config.enablePersistence).toBe(false);
    expect(config.maxQueueSize).toBe(1000);
    expect(config.maxSubscriptions).toBe(10000);
    expect(config.timeout).toBe(5000);
    expect(config.retryOnFailure).toBe(false);
    expect(config.maxRetries).toBe(3);
    expect(config.enableMetrics).toBe(true);
    expect(config.enableLogging).toBe(true);
    expect(config.logLevel).toBe('info');
    expect(config.serializationFormat).toBe('json');
  });

  it('should create with custom options', () => {
    const config = new EventBusConfig({ enableAsync: false, maxRetries: 5, logLevel: 'debug' });
    expect(config.enableAsync).toBe(false);
    expect(config.maxRetries).toBe(5);
    expect(config.logLevel).toBe('debug');
  });

  it('should create static default', () => {
    const config = EventBusConfig.default();
    expect(config.enableAsync).toBe(true);
  });

  it('should create static create', () => {
    const config = EventBusConfig.create({ maxQueueSize: 5000 });
    expect(config.maxQueueSize).toBe(5000);
  });

  it('should withOptions', () => {
    const config = new EventBusConfig().withOptions({ timeout: 10000 });
    expect(config.timeout).toBe(10000);
  });

  it('should toJSON', () => {
    const config = new EventBusConfig({ maxQueueSize: 2000 });
    const json = config.toJSON();
    expect(json.maxQueueSize).toBe(2000);
  });

  it('should fromJSON', () => {
    const config = EventBusConfig.fromJSON({ maxQueueSize: 3000, logLevel: 'warn' });
    expect(config.maxQueueSize).toBe(3000);
    expect(config.logLevel).toBe('warn');
  });

  it('should fromJSON with invalid input', () => {
    const config = EventBusConfig.fromJSON(null);
    expect(config.maxQueueSize).toBe(1000);
    const config2 = EventBusConfig.fromJSON('invalid');
    expect(config2.maxQueueSize).toBe(1000);
  });
});

describe('EventConfigValidator', () => {
  let validator: EventConfigValidator;

  beforeEach(() => {
    validator = new EventConfigValidator();
  });

  it('should validate correct config', () => {
    const config = EventConfigBuilder.development().build();
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject invalid timeout', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.timeout = 0;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('timeout'))).toBe(true);
  });

  it('should reject invalid maxRetries', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.maxRetries = 200;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('maxRetries'))).toBe(true);
  });

  it('should reject invalid maxQueueSize', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.maxQueueSize = -1;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid logLevel', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.logLevel = 'invalid' as any;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid serializationFormat', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.serializationFormat = 'xml' as any;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid adapter type', () => {
    const config = EventConfigBuilder.development().build();
    config.adapter.type = 'invalid' as any;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid strategy name', () => {
    const config = EventConfigBuilder.development().build();
    config.strategy.name = 'invalid' as any;
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject empty Kafka topics', () => {
    const config = EventConfigBuilder.development().build();
    config.adapter.type = 'kafka';
    config.adapter.config = {
      producer: { brokers: ['localhost:9092'] },
      consumer: { brokers: ['localhost:9092'], groupId: 'test', topics: [] },
    };
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('topics'))).toBe(true);
  });

  it('should warn about memory adapter with persistence', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.enablePersistence = true;
    config.adapter.type = 'memory';
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('adapter.type'))).toBe(true);
  });

  it('should warn about low timeout with high queue', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.maxQueueSize = 20000;
    config.eventBus.timeout = 500;
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('timeout'))).toBe(true);
  });

  it('should warn about retry enabled with zero retries', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.retryOnFailure = true;
    config.eventBus.maxRetries = 0;
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('maxRetries'))).toBe(true);
  });

  it('should warn about collection interval > retention', () => {
    const config = EventConfigBuilder.development().build();
    config.metrics.collectionIntervalMs = 5000000;
    config.metrics.sampleRetentionMs = 1000000;
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('collectionIntervalMs'))).toBe(true);
  });

  it('should warn about frequent health checks', () => {
    const config = EventConfigBuilder.development().build();
    config.healthCheck.intervalMs = 1000;
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('intervalMs'))).toBe(true);
  });

  it('should warn about HTTP adapter with no endpoints', () => {
    const config = EventConfigBuilder.development().build();
    config.adapter.type = 'http';
    config.adapter.config = { endpoints: [] };
    const result = validator.validate(config);
    expect(result.warnings.some(w => w.path.includes('endpoints'))).toBe(true);
  });

  it('should throw on invalid config', () => {
    const config = EventConfigBuilder.development().build();
    config.eventBus.timeout = 0;
    expect(() => validator.validateOrThrow(config)).toThrow('Invalid event configuration');
  });

  it('should validate event bus config only', () => {
    const result = validator.validateEventBusConfig({ timeout: 5000, maxRetries: 3 });
    expect(result.valid).toBe(true);
  });

  it('should validate adapter config', () => {
    const result = validator.validateAdapterConfig('memory', { enableAsync: true });
    expect(result.valid).toBe(true);
  });

  it('should validate strategy config', () => {
    const result = validator.validateStrategyConfig({ name: 'default', config: {} });
    expect(result.valid).toBe(true);
  });

  it('should get defaults', () => {
    const defaults = validator.getDefaults();
    expect(defaults.enableAsync).toBe(true);
    expect(defaults.maxRetries).toBe(3);
  });
});

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    loader = new ConfigLoader('TEST_');
  });

  it('should load default config', () => {
    const loaded = loader.loadDefault();
    expect(loaded.config).toBeInstanceOf(EventBusConfig);
    expect(loaded.source).toBe('default');
    expect(loaded.validationResult.valid).toBe(true);
  });

  it('should load from programmatic', () => {
    const loaded = loader.loadFromProgrammatic({ maxQueueSize: 5000, logLevel: 'debug' });
    expect(loaded.config.maxQueueSize).toBe(5000);
    expect(loaded.config.logLevel).toBe('debug');
    expect(loaded.source).toBe('programmatic');
  });

  it('should load from env', () => {
    process.env.TEST_MAX_QUEUE_SIZE = '2000';
    process.env.TEST_LOG_LEVEL = 'warn';
    const loaded = loader.loadFromEnv();
    expect(loaded.config.maxQueueSize).toBe(2000);
    expect(loaded.config.logLevel).toBe('warn');
    delete process.env.TEST_MAX_QUEUE_SIZE;
    delete process.env.TEST_LOG_LEVEL;
  });

  it('should parse env values', () => {
    expect((loader as any)._parseEnvValue('true')).toBe(true);
    expect((loader as any)._parseEnvValue('false')).toBe(false);
    expect((loader as any)._parseEnvValue('42')).toBe(42);
    expect((loader as any)._parseEnvValue('hello')).toBe('hello');
    expect((loader as any)._parseEnvValue('')).toBe('');
  });

  it('should set and get env prefix', () => {
    loader.setEnvPrefix('NEW_');
    expect(loader.getEnvPrefix()).toBe('NEW_');
  });
});

describe('ConfigValidator (legacy)', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  it('should validate config', () => {
    const config = new EventBusConfig({ maxQueueSize: 1000, timeout: 5000 });
    const result = validator.validate(config);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid maxQueueSize', () => {
    const config = new EventBusConfig({ maxQueueSize: 0 });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'maxQueueSize')).toBe(true);
  });

  it('should reject invalid maxSubscriptions', () => {
    const config = new EventBusConfig({ maxSubscriptions: 0 });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid timeout', () => {
    const config = new EventBusConfig({ timeout: 0 });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid maxRetries', () => {
    const config = new EventBusConfig({ maxRetries: 11 });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid logLevel', () => {
    const config = new EventBusConfig({ logLevel: 'invalid' });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid serializationFormat', () => {
    const config = new EventBusConfig({ serializationFormat: 'xml' });
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should add custom rule', () => {
    validator.addRule({
      field: 'customField',
      severity: 'error',
      validate: (c) => (c as any).customField === 'valid',
      defaultMessage: 'customField must be valid',
    });
    const config = new EventBusConfig({ customField: 'invalid' } as any);
    const result = validator.validate(config);
    expect(result.valid).toBe(false);
  });

  it('should remove rule', () => {
    expect(validator.removeRule('maxQueueSize')).toBe(true);
    const config = new EventBusConfig({ maxQueueSize: 0 });
    const result = validator.validate(config);
    expect(result.valid).toBe(true); // Rule removed, so no error
  });
});

describe('Configuration defaults', () => {
  it('should have valid limits', () => {
    expect(EVENT_CONFIG_LIMITS.minTimeout).toBeLessThan(EVENT_CONFIG_LIMITS.maxTimeout);
    expect(EVENT_CONFIG_LIMITS.minRetries).toBeLessThan(EVENT_CONFIG_LIMITS.maxRetries);
    expect(EVENT_CONFIG_LIMITS.minQueueSize).toBeLessThan(EVENT_CONFIG_LIMITS.maxQueueSize);
  });

  it('should have valid log levels', () => {
    expect(VALID_LOG_LEVELS).toContain('debug');
    expect(VALID_LOG_LEVELS).toContain('info');
    expect(VALID_LOG_LEVELS).toContain('warn');
    expect(VALID_LOG_LEVELS).toContain('error');
  });

  it('should have valid serialization formats', () => {
    expect(VALID_SERIALIZATION_FORMATS).toContain('json');
    expect(VALID_SERIALIZATION_FORMATS).toContain('protobuf');
    expect(VALID_SERIALIZATION_FORMATS).toContain('msgpack');
  });

  it('should have valid adapter types', () => {
    expect(VALID_ADAPTER_TYPES).toContain('memory');
    expect(VALID_ADAPTER_TYPES).toContain('redis');
    expect(VALID_ADAPTER_TYPES).toContain('http');
    expect(VALID_ADAPTER_TYPES).toContain('kafka');
  });

  it('should have valid strategy names', () => {
    expect(VALID_STRATEGY_NAMES).toContain('default');
    expect(VALID_STRATEGY_NAMES).toContain('fast');
    expect(VALID_STRATEGY_NAMES).toContain('reliable');
    expect(VALID_STRATEGY_NAMES).toContain('cached');
    expect(VALID_STRATEGY_NAMES).toContain('batch');
    expect(VALID_STRATEGY_NAMES).toContain('broadcast');
    expect(VALID_STRATEGY_NAMES).toContain('filtered');
    expect(VALID_STRATEGY_NAMES).toContain('prioritized');
    expect(VALID_STRATEGY_NAMES).toContain('dead-letter');
  });

  it('should have valid profiles', () => {
    expect(VALID_PROFILES).toContain('development');
    expect(VALID_PROFILES).toContain('testing');
    expect(VALID_PROFILES).toContain('staging');
    expect(VALID_PROFILES).toContain('production');
    expect(VALID_PROFILES).toContain('high-throughput');
    expect(VALID_PROFILES).toContain('low-latency');
    expect(VALID_PROFILES).toContain('reliable');
  });

  it('should have default event bus config', () => {
    expect(DEFAULT_EVENT_BUS_CONFIG.enableAsync).toBe(true);
    expect(DEFAULT_EVENT_BUS_CONFIG.maxRetries).toBe(3);
  });
});