/**
 * EventBusConfig Unit Tests
 * 
 * Comprehensive tests for EventBusConfig configuration.
 * Tests cover configuration creation, defaults, validation, and edge cases.
 */

import { EventBusConfig, EventBusConfigOptions } from '../../configuration/EventBusConfig';

describe('EventBusConfig', () => {
  describe('constructor', () => {
    it('should create with default values', () => {
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

    it('should create with custom values', () => {
      const options: EventBusConfigOptions = {
        enableAsync: false,
        enablePersistence: true,
        maxQueueSize: 500,
        maxSubscriptions: 5000,
        timeout: 10000,
        retryOnFailure: true,
        maxRetries: 5,
        enableMetrics: false,
        enableLogging: false,
        logLevel: 'debug',
        serializationFormat: 'protobuf',
      };

      const config = new EventBusConfig(options);

      expect(config.enableAsync).toBe(false);
      expect(config.enablePersistence).toBe(true);
      expect(config.maxQueueSize).toBe(500);
      expect(config.maxSubscriptions).toBe(5000);
      expect(config.timeout).toBe(10000);
      expect(config.retryOnFailure).toBe(true);
      expect(config.maxRetries).toBe(5);
      expect(config.enableMetrics).toBe(false);
      expect(config.enableLogging).toBe(false);
      expect(config.logLevel).toBe('debug');
      expect(config.serializationFormat).toBe('protobuf');
    });

    it('should merge partial options with defaults', () => {
      const options: EventBusConfigOptions = {
        enableAsync: false,
        maxQueueSize: 2000,
      };

      const config = new EventBusConfig(options);

      expect(config.enableAsync).toBe(false);
      expect(config.maxQueueSize).toBe(2000);
      expect(config.enablePersistence).toBe(false);
      expect(config.timeout).toBe(5000);
    });

    it('should handle undefined options', () => {
      const config = new EventBusConfig(undefined as any);
      expect(config).toBeDefined();
      expect(config.enableAsync).toBe(true);
    });
  });

  describe('create', () => {
    it('should create config with options', () => {
      const options: EventBusConfigOptions = {
        enableAsync: false,
        maxQueueSize: 500,
      };

      const config = EventBusConfig.create(options);

      expect(config.enableAsync).toBe(false);
      expect(config.maxQueueSize).toBe(500);
    });

    it('should create config without options', () => {
      const config = EventBusConfig.create();

      expect(config.enableAsync).toBe(true);
      expect(config.maxQueueSize).toBe(1000);
    });
  });

  describe('default', () => {
    it('should create config with default values', () => {
      const config = EventBusConfig.default();

      expect(config.enableAsync).toBe(true);
      expect(config.enablePersistence).toBe(false);
      expect(config.maxQueueSize).toBe(1000);
      expect(config.maxSubscriptions).toBe(10000);
    });
  });

  describe('withOptions', () => {
    it('should create new config with merged options', () => {
      const original = EventBusConfig.default();
      const modified = original.withOptions({
        enableAsync: false,
        maxQueueSize: 2000,
      });

      expect(modified.enableAsync).toBe(false);
      expect(modified.maxQueueSize).toBe(2000);
      expect(modified.enablePersistence).toBe(original.enablePersistence);
    });

    it('should not modify original config', () => {
      const original = EventBusConfig.default();
      const modified = original.withOptions({ enableAsync: false });

      expect(original.enableAsync).toBe(true);
      expect(modified.enableAsync).toBe(false);
    });

    it('should override existing values', () => {
      const original = EventBusConfig.default();
      const modified = original.withOptions({ maxQueueSize: 5000 });

      expect(modified.maxQueueSize).toBe(5000);
    });
  });

  describe('toJSON', () => {
    it('should serialize config to object', () => {
      const config = EventBusConfig.default();
      const json = config.toJSON();

      expect(json).toEqual({
        enableAsync: true,
        enablePersistence: false,
        maxQueueSize: 1000,
        maxSubscriptions: 10000,
        timeout: 5000,
        retryOnFailure: false,
        maxRetries: 3,
        enableMetrics: true,
        enableLogging: true,
        logLevel: 'info',
        serializationFormat: 'json',
      });
    });

    it('should serialize custom config', () => {
      const config = new EventBusConfig({
        enableAsync: false,
        maxQueueSize: 500,
      });

      const json = config.toJSON();

      expect(json.enableAsync).toBe(false);
      expect(json.maxQueueSize).toBe(500);
    });
  });

  describe('fromJSON', () => {
    it('should create config from JSON object', () => {
      const json = {
        enableAsync: false,
        enablePersistence: true,
        maxQueueSize: 500,
        maxSubscriptions: 5000,
        timeout: 10000,
        retryOnFailure: true,
        maxRetries: 5,
        enableMetrics: false,
        enableLogging: false,
        logLevel: 'debug',
        serializationFormat: 'protobuf',
      };

      const config = EventBusConfig.fromJSON(json);

      expect(config.enableAsync).toBe(false);
      expect(config.enablePersistence).toBe(true);
      expect(config.maxQueueSize).toBe(500);
    });

    it('should use defaults for missing fields', () => {
      const json = {
        enableAsync: false,
        maxQueueSize: 500,
      };

      const config = EventBusConfig.fromJSON(json);

      expect(config.enableAsync).toBe(false);
      expect(config.maxQueueSize).toBe(500);
      expect(config.enablePersistence).toBe(false);
      expect(config.timeout).toBe(5000);
    });

    it('should handle empty JSON', () => {
      const config = EventBusConfig.fromJSON({});

      expect(config.enableAsync).toBe(true);
      expect(config.maxQueueSize).toBe(1000);
    });
  });

  describe('edge cases', () => {
    it('should handle very large maxQueueSize', () => {
      const config = new EventBusConfig({ maxQueueSize: 1000000 });
      expect(config.maxQueueSize).toBe(1000000);
    });

    it('should handle very large maxSubscriptions', () => {
      const config = new EventBusConfig({ maxSubscriptions: 10000000 });
      expect(config.maxSubscriptions).toBe(10000000);
    });

    it('should handle very large timeout', () => {
      const config = new EventBusConfig({ timeout: 600000 });
      expect(config.timeout).toBe(600000);
    });

    it('should handle very large maxRetries', () => {
      const config = new EventBusConfig({ maxRetries: 100 });
      expect(config.maxRetries).toBe(100);
    });

    it('should handle zero maxQueueSize', () => {
      const config = new EventBusConfig({ maxQueueSize: 0 });
      expect(config.maxQueueSize).toBe(0);
    });

    it('should handle zero timeout', () => {
      const config = new EventBusConfig({ timeout: 0 });
      expect(config.timeout).toBe(0);
    });

    it('should handle zero maxRetries', () => {
      const config = new EventBusConfig({ maxRetries: 0 });
      expect(config.maxRetries).toBe(0);
    });

    it('should handle negative maxQueueSize', () => {
      const config = new EventBusConfig({ maxQueueSize: -100 });
      expect(config.maxQueueSize).toBe(-100);
    });

    it('should handle all boolean flags true', () => {
      const config = new EventBusConfig({
        enableAsync: true,
        enablePersistence: true,
        retryOnFailure: true,
        enableMetrics: true,
        enableLogging: true,
      });

      expect(config.enableAsync).toBe(true);
      expect(config.enablePersistence).toBe(true);
      expect(config.retryOnFailure).toBe(true);
      expect(config.enableMetrics).toBe(true);
      expect(config.enableLogging).toBe(true);
    });

    it('should handle all boolean flags false', () => {
      const config = new EventBusConfig({
        enableAsync: false,
        enablePersistence: false,
        retryOnFailure: false,
        enableMetrics: false,
        enableLogging: false,
      });

      expect(config.enableAsync).toBe(false);
      expect(config.enablePersistence).toBe(false);
      expect(config.retryOnFailure).toBe(false);
      expect(config.enableMetrics).toBe(false);
      expect(config.enableLogging).toBe(false);
    });

    it('should handle different log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error'];

      for (const level of levels) {
        const config = new EventBusConfig({ logLevel: level });
        expect(config.logLevel).toBe(level);
      }
    });

    it('should handle different serialization formats', () => {
      const formats = ['json', 'protobuf', 'msgpack'];

      for (const format of formats) {
        const config = new EventBusConfig({ serializationFormat: format });
        expect(config.serializationFormat).toBe(format);
      }
    });

    it('should preserve immutability of toJSON result', () => {
      const config = EventBusConfig.default();
      const json = config.toJSON();
      json.enableAsync = false;

      expect(config.enableAsync).toBe(true);
    });
  });
});
