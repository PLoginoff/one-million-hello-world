/**
 * Configuration tests for Reporting layer
 */

import { ReportingConfigurationBuilder } from '../configuration/builders/ReportingConfigurationBuilder';
import { ReportingConfigurationValidator } from '../configuration/validators/ReportingConfigurationValidator';

describe('Reporting Configuration', () => {
  describe('ReportingConfigurationBuilder', () => {
    it('should build default configuration', () => {
      var config = new ReportingConfigurationBuilder().build();
      expect(config.enabled).toBe(true);
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
    });

    it('should chain builder methods', () => {
      var config = new ReportingConfigurationBuilder()
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
      var config = ReportingConfigurationBuilder.development();
      expect(config.logLevel).toBe('debug');
      expect(config.retries).toBe(1);
    });

    it('should create production preset', () => {
      var config = ReportingConfigurationBuilder.production();
      expect(config.logLevel).toBe('warn');
      expect(config.retries).toBe(5);
    });

    it('should add custom options', () => {
      var config = new ReportingConfigurationBuilder()
        .withOption('key', 'value')
        .withOptions({ a: 1, b: 2 })
        .build();
      expect(config.options.key).toBe('value');
      expect(config.options.a).toBe(1);
      expect(config.options.b).toBe(2);
    });
  });

  describe('ReportingConfigurationValidator', () => {
    it('should validate correct config', () => {
      var validator = new ReportingConfigurationValidator();
      var result = validator.validate({ enabled: true, timeout: 30000, retries: 3 });
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid timeout', () => {
      var validator = new ReportingConfigurationValidator();
      var result = validator.validate({ timeout: 10 });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid retries', () => {
      var validator = new ReportingConfigurationValidator();
      var result = validator.validate({ retries: 100 });
      expect(result.valid).toBe(false);
    });

    it('should reject unknown strategy', () => {
      var validator = new ReportingConfigurationValidator();
      var result = validator.validate({ strategy: 'unknown' });
      expect(result.valid).toBe(false);
    });

    it('should throw on invalid config', () => {
      var validator = new ReportingConfigurationValidator();
      expect(() => validator.validateOrThrow({ timeout: 10 })).toThrow();
    });
  });
});
