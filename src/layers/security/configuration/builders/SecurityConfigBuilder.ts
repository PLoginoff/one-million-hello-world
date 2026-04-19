/**
 * Security Configuration Builder
 * 
 * Fluent builder for creating security configurations.
 */

import { SecurityConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { SecurityConfigValidator } from '../validators/SecurityConfigValidator';
import { SecurityLevel, ThreatType } from '../../types/security-types';

export class SecurityConfigBuilder {
  private config: SecurityConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): SecurityConfigBuilder {
    return new SecurityConfigBuilder();
  }

  /**
   * Start with high security configuration
   */
  static highSecurity(): SecurityConfigBuilder {
    const builder = new SecurityConfigBuilder();
    builder.config = { ...DefaultConfigs.HIGH_SECURITY };
    return builder;
  }

  /**
   * Start with development configuration
   */
  static development(): SecurityConfigBuilder {
    const builder = new SecurityConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): SecurityConfigBuilder {
    const builder = new SecurityConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with public API configuration
   */
  static publicApi(): SecurityConfigBuilder {
    const builder = new SecurityConfigBuilder();
    builder.config = { ...DefaultConfigs.PUBLIC_API };
    return builder;
  }

  /**
   * Enable or disable authentication
   */
  withAuthentication(enabled: boolean): SecurityConfigBuilder {
    SecurityConfigValidator.validateBooleanOption(enabled, 'enableAuthentication');
    this.config.enableAuthentication = enabled;
    return this;
  }

  /**
   * Enable or disable authorization
   */
  withAuthorization(enabled: boolean): SecurityConfigBuilder {
    SecurityConfigValidator.validateBooleanOption(enabled, 'enableAuthorization');
    this.config.enableAuthorization = enabled;
    return this;
  }

  /**
   * Enable or disable threat detection
   */
  withThreatDetection(enabled: boolean): SecurityConfigBuilder {
    SecurityConfigValidator.validateBooleanOption(enabled, 'enableThreatDetection');
    this.config.enableThreatDetection = enabled;
    return this;
  }

  /**
   * Enable or disable rate limiting
   */
  withRateLimiting(enabled: boolean): SecurityConfigBuilder {
    SecurityConfigValidator.validateBooleanOption(enabled, 'enableRateLimiting');
    this.config.enableRateLimiting = enabled;
    return this;
  }

  /**
   * Enable or disable CORS
   */
  withCors(enabled: boolean): SecurityConfigBuilder {
    SecurityConfigValidator.validateBooleanOption(enabled, 'enableCors');
    this.config.enableCors = enabled;
    return this;
  }

  /**
   * Set default security level
   */
  withDefaultSecurityLevel(level: SecurityLevel): SecurityConfigBuilder {
    SecurityConfigValidator.validateSecurityLevel(level);
    this.config.defaultSecurityLevel = level;
    return this;
  }

  /**
   * Set max failed attempts
   */
  withMaxFailedAttempts(maxAttempts: number): SecurityConfigBuilder {
    SecurityConfigValidator.validateMaxFailedAttempts(maxAttempts);
    this.config.maxFailedAttempts = maxAttempts;
    return this;
  }

  /**
   * Set lockout duration in milliseconds
   */
  withLockoutDuration(duration: number): SecurityConfigBuilder {
    SecurityConfigValidator.validateLockoutDuration(duration);
    this.config.lockoutDuration = duration;
    return this;
  }

  /**
   * Set session timeout in milliseconds
   */
  withSessionTimeout(timeout: number): SecurityConfigBuilder {
    SecurityConfigValidator.validateSessionTimeout(timeout);
    this.config.sessionTimeout = timeout;
    return this;
  }

  /**
   * Set CORS origins
   */
  withCorsOrigins(origins: string[]): SecurityConfigBuilder {
    SecurityConfigValidator.validateCorsOrigins(origins);
    this.config.corsOrigins = [...origins];
    return this;
  }

  /**
   * Set CORS methods
   */
  withCorsMethods(methods: string[]): SecurityConfigBuilder {
    SecurityConfigValidator.validateCorsMethods(methods);
    this.config.corsMethods = [...methods];
    return this;
  }

  /**
   * Set CORS headers
   */
  withCorsHeaders(headers: string[]): SecurityConfigBuilder {
    SecurityConfigValidator.validateCorsHeaders(headers);
    this.config.corsHeaders = [...headers];
    return this;
  }

  /**
   * Set threat threshold
   */
  withThreatThreshold(threat: ThreatType, threshold: number): SecurityConfigBuilder {
    this.config.threatThresholds.set(threat, threshold);
    return this;
  }

  /**
   * Set multiple threat thresholds
   */
  withThreatThresholds(thresholds: Map<ThreatType, number>): SecurityConfigBuilder {
    SecurityConfigValidator.validateThreatThresholds(thresholds);
    this.config.threatThresholds = new Map(thresholds);
    return this;
  }

  /**
   * Build the configuration
   */
  build(): SecurityConfigOptions {
    SecurityConfigValidator.validate(this.config);
    return {
      ...this.config,
      threatThresholds: new Map(this.config.threatThresholds),
    };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): SecurityConfigOptions {
    return {
      ...this.config,
      threatThresholds: new Map(this.config.threatThresholds),
    };
  }
}
