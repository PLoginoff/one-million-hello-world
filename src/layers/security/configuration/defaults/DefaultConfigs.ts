/**
 * Default Security Configurations
 * 
 * Pre-configured settings for common security scenarios.
 */

import { SecurityLevel, ThreatType } from '../../types/security-types';

export interface SecurityConfigOptions {
  enableAuthentication: boolean;
  enableAuthorization: boolean;
  enableThreatDetection: boolean;
  enableRateLimiting: boolean;
  enableCors: boolean;
  defaultSecurityLevel: SecurityLevel;
  maxFailedAttempts: number;
  lockoutDuration: number;
  sessionTimeout: number;
  corsOrigins: string[];
  corsMethods: string[];
  corsHeaders: string[];
  threatThresholds: Map<ThreatType, number>;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: SecurityConfigOptions = {
    enableAuthentication: true,
    enableAuthorization: true,
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableCors: false,
    defaultSecurityLevel: SecurityLevel.MEDIUM,
    maxFailedAttempts: 5,
    lockoutDuration: 300000,
    sessionTimeout: 3600000,
    corsOrigins: [],
    corsMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    corsHeaders: ['Content-Type', 'Authorization'],
    threatThresholds: new Map([
      [ThreatType.SQL_INJECTION, 1],
      [ThreatType.XSS, 1],
      [ThreatType.CSRF, 1],
      [ThreatType.BRUTE_FORCE, 10],
      [ThreatType.DDOS, 100],
    ]),
  };

  /**
   * High security configuration
   */
  static HIGH_SECURITY: SecurityConfigOptions = {
    enableAuthentication: true,
    enableAuthorization: true,
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableCors: true,
    defaultSecurityLevel: SecurityLevel.HIGH,
    maxFailedAttempts: 3,
    lockoutDuration: 600000,
    sessionTimeout: 1800000,
    corsOrigins: ['https://trusted-domain.com'],
    corsMethods: ['GET', 'POST'],
    corsHeaders: ['Content-Type', 'Authorization'],
    threatThresholds: new Map([
      [ThreatType.SQL_INJECTION, 1],
      [ThreatType.XSS, 1],
      [ThreatType.CSRF, 1],
      [ThreatType.BRUTE_FORCE, 5],
      [ThreatType.DDOS, 50],
    ]),
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: SecurityConfigOptions = {
    enableAuthentication: false,
    enableAuthorization: false,
    enableThreatDetection: false,
    enableRateLimiting: false,
    enableCors: true,
    defaultSecurityLevel: SecurityLevel.LOW,
    maxFailedAttempts: 100,
    lockoutDuration: 60000,
    sessionTimeout: 86400000,
    corsOrigins: ['*'],
    corsMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    corsHeaders: ['*'],
    threatThresholds: new Map([
      [ThreatType.SQL_INJECTION, 100],
      [ThreatType.XSS, 100],
      [ThreatType.CSRF, 100],
      [ThreatType.BRUTE_FORCE, 1000],
      [ThreatType.DDOS, 10000],
    ]),
  };

  /**
   * Production configuration
   */
  static PRODUCTION: SecurityConfigOptions = {
    enableAuthentication: true,
    enableAuthorization: true,
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableCors: true,
    defaultSecurityLevel: SecurityLevel.HIGH,
    maxFailedAttempts: 5,
    lockoutDuration: 300000,
    sessionTimeout: 3600000,
    corsOrigins: [],
    corsMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    corsHeaders: ['Content-Type', 'Authorization'],
    threatThresholds: new Map([
      [ThreatType.SQL_INJECTION, 1],
      [ThreatType.XSS, 1],
      [ThreatType.CSRF, 1],
      [ThreatType.BRUTE_FORCE, 10],
      [ThreatType.DDOS, 100],
    ]),
  };

  /**
   * Public API configuration
   */
  static PUBLIC_API: SecurityConfigOptions = {
    enableAuthentication: false,
    enableAuthorization: false,
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableCors: true,
    defaultSecurityLevel: SecurityLevel.MEDIUM,
    maxFailedAttempts: 20,
    lockoutDuration: 120000,
    sessionTimeout: 7200000,
    corsOrigins: ['*'],
    corsMethods: ['GET', 'POST'],
    corsHeaders: ['Content-Type'],
    threatThresholds: new Map([
      [ThreatType.SQL_INJECTION, 10],
      [ThreatType.XSS, 10],
      [ThreatType.CSRF, 10],
      [ThreatType.BRUTE_FORCE, 50],
      [ThreatType.DDOS, 500],
    ]),
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<SecurityConfigOptions>): SecurityConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
      threatThresholds: options.threatThresholds || new Map(DefaultConfigs.DEFAULT.threatThresholds),
    } as SecurityConfigOptions;
  }
}
