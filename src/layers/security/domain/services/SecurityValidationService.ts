/**
 * Security Validation Service
 * 
 * Provides validation logic for security-related operations.
 */

import { SecurityContextEntity } from '../entities/SecurityContextEntity';
import { ThreatEntity } from '../entities/ThreatEntity';
import { PolicyEntity } from '../entities/PolicyEntity';
import { SecurityLevel, ThreatType } from '../../types/security-types';

export class SecurityValidationService {
  /**
   * Validate security context
   */
  static validateContext(context: SecurityContextEntity): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!context.data.ipAddress) {
      errors.push('IP address is required');
    }

    if (!context.data.userAgent) {
      errors.push('User agent is required');
    }

    if (context.data.authenticated && !context.data.userId) {
      errors.push('User ID is required for authenticated context');
    }

    if (context.data.roles.length === 0 && context.data.authenticated) {
      errors.push('At least one role is required for authenticated context');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate threat entity
   */
  static validateThreat(threat: ThreatEntity): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!threat.data.sourceIp) {
      errors.push('Source IP is required');
    }

    if (!threat.data.description) {
      errors.push('Description is required');
    }

    if (!Object.values(ThreatType).includes(threat.data.type)) {
      errors.push('Invalid threat type');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate policy entity
   */
  static validatePolicy(policy: PolicyEntity): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!policy.data.id) {
      errors.push('Policy ID is required');
    }

    if (!policy.data.name) {
      errors.push('Policy name is required');
    }

    if (policy.data.rules.length === 0) {
      errors.push('At least one rule is required');
    }

    for (let i = 0; i < policy.data.rules.length; i++) {
      const rule = policy.data.rules[i];
      if (!rule.resource) {
        errors.push(`Rule ${i}: resource is required`);
      }
      if (!rule.action) {
        errors.push(`Rule ${i}: action is required`);
      }
      if (rule.effect !== 'allow' && rule.effect !== 'deny') {
        errors.push(`Rule ${i}: effect must be allow or deny`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate IP address format
   */
  static validateIpAddress(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Validate user agent
   */
  static validateUserAgent(userAgent: string): boolean {
    if (!userAgent || userAgent.length === 0) {
      return false;
    }
    if (userAgent.length > 1024) {
      return false;
    }
    return true;
  }

  /**
   * Validate user ID format
   */
  static validateUserId(userId: string): boolean {
    if (!userId || userId.length === 0) {
      return false;
    }
    const userIdRegex = /^[a-zA-Z0-9_-]+$/;
    return userIdRegex.test(userId);
  }

  /**
   * Validate role format
   */
  static validateRole(role: string): boolean {
    if (!role || role.length === 0) {
      return false;
    }
    const roleRegex = /^[a-zA-Z0-9_-]+$/;
    return roleRegex.test(role);
  }

  /**
   * Validate permission format
   */
  static validatePermission(permission: string): boolean {
    if (!permission || permission.length === 0) {
      return false;
    }
    const parts = permission.split(':');
    if (parts.length < 2) {
      return false;
    }
    return parts.every(part => /^[a-zA-Z0-9_-]+$/.test(part));
  }

  /**
   * Check if security level is valid
   */
  static validateSecurityLevel(level: SecurityLevel): boolean {
    return Object.values(SecurityLevel).includes(level);
  }
}
