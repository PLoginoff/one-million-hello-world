/**
 * Security Factory
 * 
 * Factory for creating security components and configurations.
 */

import { SecurityConfigBuilder } from '../configuration/builders/SecurityConfigBuilder';
import { DefaultConfigs, SecurityConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { SecurityContextEntity } from '../domain/entities/SecurityContextEntity';
import { ThreatEntity } from '../domain/entities/ThreatEntity';
import { PolicyEntity } from '../domain/entities/PolicyEntity';
import { SecurityLevelValueObject } from '../domain/value-objects/SecurityLevelValueObject';
import { ThreatSeverityValueObject } from '../domain/value-objects/ThreatSeverityValueObject';
import { SecurityStatistics } from '../statistics/SecurityStatistics';
import { BasicAuthStrategy } from '../strategies/authentication/BasicAuthStrategy';
import { JwtAuthStrategy } from '../strategies/authentication/JwtAuthStrategy';
import { IAuthenticationStrategy } from '../strategies/authentication/IAuthenticationStrategy';
import { SecurityLevel, ThreatType, ThreatSeverity } from '../types/security-types';

export class SecurityFactory {
  /**
   * Create default security configuration
   */
  static createDefaultConfig(): SecurityConfigOptions {
    return SecurityConfigBuilder.create().build();
  }

  /**
   * Create high security configuration
   */
  static createHighSecurityConfig(): SecurityConfigOptions {
    return SecurityConfigBuilder.highSecurity().build();
  }

  /**
   * Create development configuration
   */
  static createDevelopmentConfig(): SecurityConfigOptions {
    return SecurityConfigBuilder.development().build();
  }

  /**
   * Create production configuration
   */
  static createProductionConfig(): SecurityConfigOptions {
    return SecurityConfigBuilder.production().build();
  }

  /**
   * Create public API configuration
   */
  static createPublicApiConfig(): SecurityConfigOptions {
    return SecurityConfigBuilder.publicApi().build();
  }

  /**
   * Create custom security configuration
   */
  static createCustomConfig(options: Partial<SecurityConfigOptions>): SecurityConfigOptions {
    return SecurityConfigBuilder.create()
      .withAuthentication(options.enableAuthentication ?? DefaultConfigs.DEFAULT.enableAuthentication)
      .withAuthorization(options.enableAuthorization ?? DefaultConfigs.DEFAULT.enableAuthorization)
      .withThreatDetection(options.enableThreatDetection ?? DefaultConfigs.DEFAULT.enableThreatDetection)
      .withRateLimiting(options.enableRateLimiting ?? DefaultConfigs.DEFAULT.enableRateLimiting)
      .withCors(options.enableCors ?? DefaultConfigs.DEFAULT.enableCors)
      .withDefaultSecurityLevel(options.defaultSecurityLevel ?? DefaultConfigs.DEFAULT.defaultSecurityLevel)
      .withMaxFailedAttempts(options.maxFailedAttempts ?? DefaultConfigs.DEFAULT.maxFailedAttempts)
      .withLockoutDuration(options.lockoutDuration ?? DefaultConfigs.DEFAULT.lockoutDuration)
      .withSessionTimeout(options.sessionTimeout ?? DefaultConfigs.DEFAULT.sessionTimeout)
      .withCorsOrigins(options.corsOrigins ?? DefaultConfigs.DEFAULT.corsOrigins)
      .withCorsMethods(options.corsMethods ?? DefaultConfigs.DEFAULT.corsMethods)
      .withCorsHeaders(options.corsHeaders ?? DefaultConfigs.DEFAULT.corsHeaders)
      .build();
  }

  /**
   * Create basic authentication strategy
   */
  static createBasicAuthStrategy(): BasicAuthStrategy {
    return new BasicAuthStrategy();
  }

  /**
   * Create JWT authentication strategy
   */
  static createJwtAuthStrategy(secretKey: string): JwtAuthStrategy {
    return new JwtAuthStrategy(secretKey);
  }

  /**
   * Create security statistics
   */
  static createSecurityStatistics(): SecurityStatistics {
    return new SecurityStatistics();
  }

  /**
   * Create security context entity
   */
  static createSecurityContextEntity(
    authenticated: boolean,
    userId: string | undefined,
    roles: string[],
    permissions: string[],
    ipAddress: string,
    userAgent: string,
    securityLevel: SecurityLevel
  ): SecurityContextEntity {
    if (authenticated) {
      return SecurityContextEntity.createAuthenticated(
        userId!,
        roles,
        permissions,
        ipAddress,
        userAgent,
        securityLevel
      );
    } else {
      return SecurityContextEntity.createUnauthenticated(ipAddress, userAgent);
    }
  }

  /**
   * Create unauthenticated security context
   */
  static createUnauthenticatedContext(ipAddress: string, userAgent: string): SecurityContextEntity {
    return SecurityContextEntity.createUnauthenticated(ipAddress, userAgent);
  }

  /**
   * Create threat entity
   */
  static createThreatEntity(
    type: ThreatType,
    severity: ThreatSeverity,
    description: string,
    sourceIp: string,
    metadata?: Record<string, any>
  ): ThreatEntity {
    return ThreatEntity.fromBasic(type, severity, description, sourceIp, metadata);
  }

  /**
   * Create policy entity
   */
  static createPolicyEntity(
    id: string,
    name: string,
    description: string,
    securityLevel: SecurityLevel,
    rules: Array<{ resource: string; action: string; effect: 'allow' | 'deny' }>
  ): PolicyEntity {
    return PolicyEntity.createSimple(id, name, description, securityLevel, rules);
  }

  /**
   * Create security level value object
   */
  static createSecurityLevelValueObject(level: SecurityLevel): SecurityLevelValueObject {
    return SecurityLevelValueObject.create(level);
  }

  /**
   * Create threat severity value object
   */
  static createThreatSeverityValueObject(severity: ThreatSeverity): ThreatSeverityValueObject {
    return ThreatSeverityValueObject.create(severity);
  }

  /**
   * Create complete security stack with default configuration
   */
  static createDefaultSecurityStack(): {
    config: SecurityConfigOptions;
    strategy: IAuthenticationStrategy;
    statistics: SecurityStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      strategy: this.createBasicAuthStrategy(),
      statistics: this.createSecurityStatistics(),
    };
  }

  /**
   * Create high security stack
   */
  static createHighSecurityStack(secretKey: string): {
    config: SecurityConfigOptions;
    strategy: IAuthenticationStrategy;
    statistics: SecurityStatistics;
  } {
    return {
      config: this.createHighSecurityConfig(),
      strategy: this.createJwtAuthStrategy(secretKey),
      statistics: this.createSecurityStatistics(),
    };
  }

  /**
   * Create development security stack
   */
  static createDevelopmentSecurityStack(): {
    config: SecurityConfigOptions;
    strategy: IAuthenticationStrategy;
    statistics: SecurityStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      strategy: this.createBasicAuthStrategy(),
      statistics: this.createSecurityStatistics(),
    };
  }
}
