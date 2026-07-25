/**
 * Configuration tests for RulesEngine layer
 */

import { RulesEngineConfigurationBuilder } from '../configuration/builders/RulesEngineConfigurationBuilder';
import { RulesEngineConfigurationValidator } from '../configuration/validators/RulesEngineConfigurationValidator';

describe('RulesEngine Configuration', () => {
  describe('RulesEngineConfigurationBuilder', () => {
    it('should build default configuration', () => {
      var config = new RulesEngineConfigurationBuilder().build();
      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
    });

    it('should chain builder methods', () => {
      var config = new RulesEngineConfigurationBuilder()
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
      var config = RulesEngineConfigurationBuilder.development();
      expect(config.logLevel).toBe('debug');
      expect(config.retries).toBe(1);
    });

    it('should create production preset', () => {
      var config = RulesEngineConfigurationBuilder.production();
      expect(config.logLevel).toBe('warn');
      expect(config.retries).toBe(5);
    });

    it('should add custom options', () => {
      var config = new RulesEngineConfigurationBuilder()
        .withOption('key', 'value')
        .withOptions({ a: 1, b: 2 })
        .build();
      expect(config.options.key).toBe('value');
      expect(config.options.a).toBe(1);
      expect(config.options.b).toBe(2);
    });
  });

  describe('RulesEngineConfigurationValidator', () => {
    it('should validate correct config', () => {
      var validator = new RulesEngineConfigurationValidator();
      var result = validator.validate({ enabled: true, timeout: 30000, retries: 3 });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid timeout', () => {
      var validator = new RulesEngineConfigurationValidator();
      var result = validator.validate({ timeout: 10 });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid retries', () => {
      var validator = new RulesEngineConfigurationValidator();
      var result = validator.validate({ retries: 100 });
      expect(result.valid).toBe(false);
    });

    it('should reject unknown strategy', () => {
      var validator = new RulesEngineConfigurationValidator();
      var result = validator.validate({ strategy: 'unknown' });
      expect(result.valid).toBe(false);
    });

    it('should throw on invalid config', () => {
      var validator = new RulesEngineConfigurationValidator();
      expect(() => validator.validateOrThrow({ timeout: 10 })).toThrow();
    });
  });
});
