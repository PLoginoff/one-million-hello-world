/**
 * Configuration tests for ReadModel layer
 */

import { ReadModelConfigurationBuilder } from '../configuration/builders/ReadModelConfigurationBuilder';
import { ReadModelConfigurationValidator } from '../configuration/validators/ReadModelConfigurationValidator';

describe('ReadModel Configuration', () => {
  describe('ReadModelConfigurationBuilder', () => {
    it('should build default configuration', () => {
      var config = new ReadModelConfigurationBuilder().build();
      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
    });

    it('should chain builder methods', () => {
      var config = new ReadModelConfigurationBuilder()
        .withTimeout(5000)
        .withRetries(1)
        .withLogLevel('debug')
        .withStrategy('fast')
        .build();
      expect(config.timeout).toBe(5000);
      expect(config.retries).toBe(1);
      expect(config.logLevel).toBe('debug');
      expect(config.strategy).toBe('fast');
    });

    it('should create development preset', () => {
      var config = ReadModelConfigurationBuilder.development();
      expect(config.logLevel).toBe('debug');
      expect(config.retries).toBe(1);
    });

    it('should create production preset', () => {
      var config = ReadModelConfigurationBuilder.production();
      expect(config.logLevel).toBe('warn');
      expect(config.retries).toBe(5);
    });

    it('should add custom options', () => {
      var config = new ReadModelConfigurationBuilder()
        .withOption('key', 'value')
        .withOptions({ a: 1, b: 2 })
        .build();
      expect(config.options.key).toBe('value');
      expect(config.options.a).toBe(1);
      expect(config.options.b).toBe(2);
    });
  });

  describe('ReadModelConfigurationValidator', () => {
    it('should validate correct config', () => {
      var validator = new ReadModelConfigurationValidator();
      var result = validator.validate({ enabled: true, timeout: 30000, retries: 3 });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid timeout', () => {
      var validator = new ReadModelConfigurationValidator();
      var result = validator.validate({ timeout: 10 });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid retries', () => {
      var validator = new ReadModelConfigurationValidator();
      var result = validator.validate({ retries: 100 });
      expect(result.valid).toBe(false);
    });

    it('should reject unknown strategy', () => {
      var validator = new ReadModelConfigurationValidator();
      var result = validator.validate({ strategy: 'unknown' });
      expect(result.valid).toBe(false);
    });

    it('should throw on invalid config', () => {
      var validator = new ReadModelConfigurationValidator();
      expect(() => validator.validateOrThrow({ timeout: 10 })).toThrow();
    });
  });
});
