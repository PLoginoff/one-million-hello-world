/**
 * Cache Configuration Tests
 */

import { CacheConfigValidator, Validators } from '../configuration/validators/CacheConfigValidator';
import { getProfile, getProfilesByTag, createProfile, CacheEnvironmentProfile } from '../configuration/defaults/CacheProfiles';
import { CacheConfigurationBuilder } from '../configuration/builders/CacheConfigurationBuilder';

describe('CacheConfigValidator', () => {
  let validator: CacheConfigValidator;

  beforeEach(() => {
    validator = new CacheConfigValidator();
  });

  describe('validate', () => {
    it('should validate correct config', () => {
      const result = validator.validate({
        enabled: true,
        timeout: 30000,
        retries: 3,
        logLevel: 'info',
        strategy: 'lru',
        maxSize: 10000,
        defaultTTL: 300000,
        invalidationStrategy: 'LRU',
        enableMultiLevel: false,
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid timeout', () => {
      const result = validator.validate({ timeout: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'timeout')).toBe(true);
    });

    it('should reject invalid retries', () => {
      const result = validator.validate({ retries: 100 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'retries')).toBe(true);
    });

    it('should reject invalid strategy', () => {
      const result = validator.validate({ strategy: 'unknown' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'strategy')).toBe(true);
    });

    it('should reject invalid maxSize', () => {
      const result = validator.validate({ maxSize: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'maxSize')).toBe(true);
    });

    it('should reject too large maxSize', () => {
      const result = validator.validate({ maxSize: 20000000 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'maxSize')).toBe(true);
    });

    it('should reject negative TTL', () => {
      const result = validator.validate({ defaultTTL: -1 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'defaultTTL')).toBe(true);
    });

    it('should reject too large TTL', () => {
      const result = validator.validate({ defaultTTL: 100000000 });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'defaultTTL')).toBe(true);
    });

    it('should generate warnings for small cache', () => {
      const result = validator.validate({
        maxSize: 50,
        defaultTTL: 300000,
      });
      expect(result.warnings.some(w => w.code === 'SMALL_CACHE_SIZE')).toBe(true);
    });

    it('should generate warnings for large cache', () => {
      const result = validator.validate({
        maxSize: 2000000,
        defaultTTL: 300000,
      });
      expect(result.warnings.some(w => w.code === 'LARGE_CACHE_SIZE')).toBe(true);
    });

    it('should generate warnings for zero TTL', () => {
      const result = validator.validate({
        maxSize: 10000,
        defaultTTL: 0,
      });
      expect(result.warnings.some(w => w.code === 'NO_TTL')).toBe(true);
    });

    it('should generate warnings for multi-level without backend', () => {
      const result = validator.validate({
        maxSize: 10000,
        defaultTTL: 300000,
        enableMultiLevel: true,
      });
      expect(result.warnings.some(w => w.code === 'MULTI_LEVEL_NO_BACKEND')).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('should throw on invalid config', () => {
      expect(() => validator.validateOrThrow({ timeout: 100 })).toThrow();
    });

    it('should not throw on valid config', () => {
      expect(() => validator.validateOrThrow({
        enabled: true,
        timeout: 30000,
        retries: 3,
        strategy: 'lru',
        maxSize: 10000,
        defaultTTL: 300000,
      })).not.toThrow();
    });
  });

  describe('validatePartial', () => {
    it('should validate partial config', () => {
      const result = validator.validatePartial({ maxSize: 5000 });
      expect(result.valid).toBe(true);
    });

    it('should reject invalid partial config', () => {
      const result = validator.validatePartial({ maxSize: 0 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateForProfile', () => {
    it('should validate config merged with profile', () => {
      const result = validator.validateForProfile({
        maxSize: 5000,
      }, 'production');

      expect(result.valid).toBe(true);
      expect(result.data!.maxSize).toBe(5000);
      expect(result.data!.defaultTTL).toBe(3600000); // From production profile
    });
  });
});

describe('Validators', () => {
  it('should have standard validator', () => {
    expect(Validators.standard).toBeInstanceOf(CacheConfigValidator);
  });

  it('should create profile validator', () => {
    const profileValidator = Validators.forProfile('production');
    expect(profileValidator).toBeInstanceOf(CacheConfigValidator);
  });

  it('should create redis validator', () => {
    expect(Validators.redis).toBeInstanceOf(CacheConfigValidator);
  });

  it('should create cluster validator', () => {
    expect(Validators.cluster).toBeInstanceOf(CacheConfigValidator);
  });
});

describe('CacheProfiles', () => {
  it('should get development profile', () => {
    const profile = getProfile('development');
    expect(profile.name).toBe('development');
    expect(profile.config.maxSize).toBe(1000);
    expect(profile.recommendedStrategy).toBe('lru');
  });

  it('should get production profile', () => {
    const profile = getProfile('production');
    expect(profile.name).toBe('production');
    expect(profile.config.maxSize).toBe(100000);
    expect(profile.recommendedStrategy).toBe('lfu');
    expect(profile.redisRecommended).toBe(true);
    expect(profile.clusterRecommended).toBe(true);
  });

  it('should get test profile', () => {
    const profile = getProfile('test');
    expect(profile.name).toBe('test');
    expect(profile.config.maxSize).toBe(100);
    expect(profile.config.defaultTTL).toBe(1000);
  });

  it('should get all profiles', () => {
    const profiles = getProfile('development');
    expect(profiles).toBeDefined();
  });

  it('should get profiles by tag', () => {
    const prodProfiles = getProfilesByTag('prod');
    expect(prodProfiles.length).toBeGreaterThan(0);
    expect(prodProfiles.some(p => p.name === 'production')).toBe(true);
  });

  it('should create custom profile', () => {
    const custom = createProfile(
      'custom',
      'Custom profile',
      { maxSize: 5000, defaultTTL: 120000, invalidationStrategy: 'LRU', enableMultiLevel: false },
      { recommendedStrategy: 'fifo', tags: ['custom'] }
    );
    expect(custom.name).toBe('custom');
    expect(custom.recommendedStrategy).toBe('fifo');
  });
});

describe('CacheConfigurationBuilder', () => {
  it('should build default configuration', () => {
    const config = new CacheConfigurationBuilder().build();
    expect(config.enabled).toBe(true);
    expect(config.timeout).toBe(30000);
    expect(config.retries).toBe(3);
  });

  it('should chain builder methods', () => {
    const config = new CacheConfigurationBuilder()
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
    const config = CacheConfigurationBuilder.development();
    expect(config.logLevel).toBe('debug');
    expect(config.retries).toBe(1);
  });

  it('should create production preset', () => {
    const config = CacheConfigurationBuilder.production();
    expect(config.logLevel).toBe('warn');
    expect(config.retries).toBe(5);
  });

  it('should add custom options', () => {
    const config = new CacheConfigurationBuilder()
      .withOption('key', 'value')
      .withOptions({ a: 1, b: 2 })
      .build();
    expect(config.options.key).toBe('value');
    expect(config.options.a).toBe(1);
    expect(config.options.b).toBe(2);
  });
});