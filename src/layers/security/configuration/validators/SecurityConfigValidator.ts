/**
 * Security Configuration Validator
 * 
 * Validates security configuration options.
 */

import { SecurityConfigOptions } from '../defaults/DefaultConfigs';
import { SecurityLevel, ThreatType } from '../../types/security-types';

export class SecurityConfigValidator {
  private static readonly MAX_FAILED_ATTEMPTS = 1000;
  private static readonly MIN_FAILED_ATTEMPTS = 1;
  private static readonly MAX_LOCKOUT_DURATION = 86400000;
  private static readonly MIN_LOCKOUT_DURATION = 1000;
  private static readonly MAX_SESSION_TIMEOUT = 86400000;
  private static readonly MIN_SESSION_TIMEOUT = 60000;

  /**
   * Validate complete configuration
   */
  static validate(config: SecurityConfigOptions): void {
    this.validateMaxFailedAttempts(config.maxFailedAttempts);
    this.validateLockoutDuration(config.lockoutDuration);
    this.validateSessionTimeout(config.sessionTimeout);
    this.validateCorsOrigins(config.corsOrigins);
    this.validateCorsMethods(config.corsMethods);
    this.validateCorsHeaders(config.corsHeaders);
    this.validateThreatThresholds(config.threatThresholds);
  }

  /**
   * Validate max failed attempts
   */
  static validateMaxFailedAttempts(maxFailedAttempts: number): void {
    if (typeof maxFailedAttempts !== 'number' || isNaN(maxFailedAttempts)) {
      throw new Error('maxFailedAttempts must be a number');
    }
    if (!Number.isInteger(maxFailedAttempts)) {
      throw new Error('maxFailedAttempts must be an integer');
    }
    if (maxFailedAttempts < this.MIN_FAILED_ATTEMPTS) {
      throw new Error(`maxFailedAttempts must be at least ${this.MIN_FAILED_ATTEMPTS}`);
    }
    if (maxFailedAttempts > this.MAX_FAILED_ATTEMPTS) {
      throw new Error(`maxFailedAttempts cannot exceed ${this.MAX_FAILED_ATTEMPTS}`);
    }
  }

  /**
   * Validate lockout duration
   */
  static validateLockoutDuration(lockoutDuration: number): void {
    if (typeof lockoutDuration !== 'number' || isNaN(lockoutDuration)) {
      throw new Error('lockoutDuration must be a number');
    }
    if (!Number.isInteger(lockoutDuration)) {
      throw new Error('lockoutDuration must be an integer');
    }
    if (lockoutDuration < this.MIN_LOCKOUT_DURATION) {
      throw new Error(`lockoutDuration must be at least ${this.MIN_LOCKOUT_DURATION}ms`);
    }
    if (lockoutDuration > this.MAX_LOCKOUT_DURATION) {
      throw new Error(`lockoutDuration cannot exceed ${this.MAX_LOCKOUT_DURATION}ms`);
    }
  }

  /**
   * Validate session timeout
   */
  static validateSessionTimeout(sessionTimeout: number): void {
    if (typeof sessionTimeout !== 'number' || isNaN(sessionTimeout)) {
      throw new Error('sessionTimeout must be a number');
    }
    if (!Number.isInteger(sessionTimeout)) {
      throw new Error('sessionTimeout must be an integer');
    }
    if (sessionTimeout < this.MIN_SESSION_TIMEOUT) {
      throw new Error(`sessionTimeout must be at least ${this.MIN_SESSION_TIMEOUT}ms`);
    }
    if (sessionTimeout > this.MAX_SESSION_TIMEOUT) {
      throw new Error(`sessionTimeout cannot exceed ${this.MAX_SESSION_TIMEOUT}ms`);
    }
  }

  /**
   * Validate CORS origins
   */
  static validateCorsOrigins(origins: string[]): void {
    if (!Array.isArray(origins)) {
      throw new Error('corsOrigins must be an array');
    }
    for (const origin of origins) {
      if (typeof origin !== 'string') {
        throw new Error('CORS origin must be a string');
      }
      if (origin !== '*' && !this.isValidUrl(origin)) {
        throw new Error(`Invalid CORS origin: ${origin}`);
      }
    }
  }

  /**
   * Validate CORS methods
   */
  static validateCorsMethods(methods: string[]): void {
    if (!Array.isArray(methods)) {
      throw new Error('corsMethods must be an array');
    }
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      if (!validMethods.includes(method)) {
        throw new Error(`Invalid CORS method: ${method}`);
      }
    }
  }

  /**
   * Validate CORS headers
   */
  static validateCorsHeaders(headers: string[]): void {
    if (!Array.isArray(headers)) {
      throw new Error('corsHeaders must be an array');
    }
    for (const header of headers) {
      if (typeof header !== 'string') {
        throw new Error('CORS header must be a string');
      }
    }
  }

  /**
   * Validate threat thresholds
   */
  static validateThreatThresholds(thresholds: Map<ThreatType, number>): void {
    if (!(thresholds instanceof Map)) {
      throw new Error('threatThresholds must be a Map');
    }
    for (const [threat, threshold] of thresholds.entries()) {
      if (!Object.values(ThreatType).includes(threat)) {
        throw new Error(`Invalid threat type: ${threat}`);
      }
      if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 1) {
        throw new Error(`Invalid threshold for ${threat}: must be a positive number`);
      }
    }
  }

  /**
   * Validate boolean configuration option
   */
  static validateBooleanOption(value: boolean, optionName: string): void {
    if (typeof value !== 'boolean') {
      throw new Error(`${optionName} must be a boolean`);
    }
  }

  /**
   * Validate security level
   */
  static validateSecurityLevel(level: SecurityLevel): void {
    if (!Object.values(SecurityLevel).includes(level)) {
      throw new Error(`Invalid security level: ${level}`);
    }
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
