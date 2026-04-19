/**
 * ConfigValidator Unit Tests
 * 
 * Comprehensive tests for ConfigValidator configuration.
 * Tests cover validation rules, custom rules, and edge cases.
 */

import { ConfigValidator, ValidationResult } from '../../configuration/ConfigValidator';
import { EventBusConfig, EventBusConfigOptions } from '../../configuration/EventBusConfig';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('constructor', () => {
    it('should create with default rules', () => {
      expect(validator).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should validate valid config', () => {
      const config = EventBusConfig.default();
      const result = validator.validate(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should validate valid config options', () => {
      const options: EventBusConfigOptions = {
        enableAsync: true,
        maxQueueSize: 1000,
        maxSubscriptions: 10000,
        timeout: 5000,
        maxRetries: 3,
        logLevel: 'info',
        serializationFormat: 'json',
      };

      const result = validator.validate(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid maxQueueSize (too small)', () => {
      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxQueueSize');
    });

    it('should detect invalid maxQueueSize (too large)', () => {
      const config = new EventBusConfig({ maxQueueSize: 100001 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxQueueSize');
    });

    it('should detect invalid maxSubscriptions (too small)', () => {
      const config = new EventBusConfig({ maxSubscriptions: 0 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxSubscriptions');
    });

    it('should detect invalid maxSubscriptions (too large)', () => {
      const config = new EventBusConfig({ maxSubscriptions: 1000001 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxSubscriptions');
    });

    it('should detect invalid timeout (too small)', () => {
      const config = new EventBusConfig({ timeout: 0 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('timeout');
    });

    it('should detect invalid timeout (too large)', () => {
      const config = new EventBusConfig({ timeout: 60001 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('timeout');
    });

    it('should detect invalid maxRetries (too small)', () => {
      const config = new EventBusConfig({ maxRetries: -1 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxRetries');
    });

    it('should detect invalid maxRetries (too large)', () => {
      const config = new EventBusConfig({ maxRetries: 11 });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('maxRetries');
    });

    it('should detect invalid logLevel', () => {
      const config = new EventBusConfig({ logLevel: 'invalid' as any });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('logLevel');
    });

    it('should detect invalid serializationFormat', () => {
      const config = new EventBusConfig({ serializationFormat: 'invalid' as any });
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('serializationFormat');
    });

    it('should return warnings array', () => {
      const config = EventBusConfig.default();
      const result = validator.validate(config);

      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should include field name in error', () => {
      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.errors[0].field).toBeDefined();
      expect(typeof result.errors[0].field).toBe('string');
    });

    it('should include error message', () => {
      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.errors[0].message).toBeDefined();
      expect(typeof result.errors[0].message).toBe('string');
    });

    it('should include invalid value in error', () => {
      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.errors[0].value).toBeDefined();
    });

    it('should detect multiple errors', () => {
      const config = new EventBusConfig({
        maxQueueSize: 0,
        maxSubscriptions: 0,
        timeout: 0,
      });

      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('addRule', () => {
    it('should add custom validation rule', () => {
      const customRule = {
        name: 'custom-rule',
        validate: (config: any) => true,
        defaultMessage: 'Custom validation failed',
      };

      validator.addRule(customRule as any);

      const config = EventBusConfig.default();
      const result = validator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should apply custom rule that fails', () => {
      const customRule = {
        name: 'custom-rule',
        validate: (config: any) => false,
        defaultMessage: 'Custom validation failed',
      };

      validator.addRule(customRule as any);

      const config = EventBusConfig.default();
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: 'Custom validation failed',
        })
      );
    });

    it('should add rule with warning severity', () => {
      const warningRule = {
        name: 'warning-rule',
        severity: 'warning' as const,
        validate: () => false,
        defaultMessage: 'Warning message',
      };

      validator.addRule(warningRule as any);

      const config = EventBusConfig.default();
      const result = validator.validate(config);

      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('removeRule', () => {
    it('should remove rule by name', () => {
      const removed = validator.removeRule('maxQueueSize');
      expect(removed).toBe(true);

      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.valid).toBe(true);
    });

    it('should return false for non-existent rule', () => {
      const removed = validator.removeRule('non-existent-rule');
      expect(removed).toBe(false);
    });

    it('should remove default rule', () => {
      validator.removeRule('maxQueueSize');

      const config = new EventBusConfig({ maxQueueSize: 0 });
      const result = validator.validate(config);

      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle config with all valid values', () => {
      const config = new EventBusConfig({
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

      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should handle config at boundary values', () => {
      const config = new EventBusConfig({
        maxQueueSize: 1,
        maxQueueSize: 100000,
        maxSubscriptions: 1,
        maxSubscriptions: 1000000,
        timeout: 1,
        timeout: 60000,
        maxRetries: 0,
        maxRetries: 10,
      });

      const result = validator.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should handle rule that throws error', () => {
      const errorRule = {
        name: 'error-rule',
        validate: () => {
          throw new Error('Rule error');
        },
        defaultMessage: 'Rule failed',
      };

      validator.addRule(errorRule as any);

      const config = EventBusConfig.default();

      expect(() => validator.validate(config)).toThrow('Rule error');
    });

    it('should handle config with undefined values', () => {
      const config = {
        enableAsync: undefined,
        maxQueueSize: undefined,
      } as any;

      const result = validator.validate(config);
      expect(result).toBeDefined();
    });

    it('should handle config with null values', () => {
      const config = {
        enableAsync: null,
        maxQueueSize: null,
      } as any;

      const result = validator.validate(config);
      expect(result).toBeDefined();
    });

    it('should handle config with string numbers', () => {
      const config = {
        maxQueueSize: '1000',
        timeout: '5000',
      } as any;

      const result = validator.validate(config);
      expect(result).toBeDefined();
    });

    it('should validate all log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error'];

      for (const level of levels) {
        const config = new EventBusConfig({ logLevel: level });
        const result = validator.validate(config);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate all serialization formats', () => {
      const formats = ['json', 'protobuf', 'msgpack'];

      for (const format of formats) {
        const config = new EventBusConfig({ serializationFormat: format });
        const result = validator.validate(config);
        expect(result.valid).toBe(true);
      }
    });
  });
});
