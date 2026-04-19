/**
 * Security Context Entity
 * 
 * Represents security context for a request with authentication and authorization data.
 */

import { SecurityLevel, ThreatType } from '../../types/security-types';

export interface SecurityContextData {
  authenticated: boolean;
  userId?: string;
  roles: string[];
  permissions: string[];
  ipAddress: string;
  userAgent: string;
  securityLevel: SecurityLevel;
  threatsDetected: ThreatType[];
  timestamp: number;
}

export class SecurityContextEntity {
  readonly data: SecurityContextData;

  private constructor(data: SecurityContextData) {
    this.data = { ...data };
  }

  /**
   * Create security context entity
   */
  static create(data: SecurityContextData): SecurityContextEntity {
    return new SecurityContextEntity(data);
  }

  /**
   * Create unauthenticated context
   */
  static createUnauthenticated(ipAddress: string, userAgent: string): SecurityContextEntity {
    return new SecurityContextEntity({
      authenticated: false,
      roles: [],
      permissions: [],
      ipAddress,
      userAgent,
      securityLevel: SecurityLevel.LOW,
      threatsDetected: [],
      timestamp: Date.now(),
    });
  }

  /**
   * Create authenticated context
   */
  static createAuthenticated(
    userId: string,
    roles: string[],
    permissions: string[],
    ipAddress: string,
    userAgent: string,
    securityLevel: SecurityLevel = SecurityLevel.MEDIUM
  ): SecurityContextEntity {
    return new SecurityContextEntity({
      authenticated: true,
      userId,
      roles,
      permissions,
      ipAddress,
      userAgent,
      securityLevel,
      threatsDetected: [],
      timestamp: Date.now(),
    });
  }

  /**
   * Check if context is authenticated
   */
  isAuthenticated(): boolean {
    return this.data.authenticated;
  }

  /**
   * Check if user has role
   */
  hasRole(role: string): boolean {
    return this.data.roles.includes(role);
  }

  /**
   * Check if user has any of the roles
   */
  hasAnyRole(roles: string[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  /**
   * Check if user has all roles
   */
  hasAllRoles(roles: string[]): boolean {
    return roles.every(role => this.hasRole(role));
  }

  /**
   * Check if user has permission
   */
  hasPermission(permission: string): boolean {
    return this.data.permissions.includes(permission);
  }

  /**
   * Check if user has any of the permissions
   */
  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some(permission => this.hasPermission(permission));
  }

  /**
   * Add detected threat
   */
  addThreat(threat: ThreatType): SecurityContextEntity {
    return new SecurityContextEntity({
      ...this.data,
      threatsDetected: [...this.data.threatsDetected, threat],
    });
  }

  /**
   * Check if threats were detected
   */
  hasThreats(): boolean {
    return this.data.threatsDetected.length > 0;
  }

  /**
   * Check if specific threat was detected
   */
  hasThreat(threat: ThreatType): boolean {
    return this.data.threatsDetected.includes(threat);
  }

  /**
   * Get context age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.data.timestamp;
  }

  /**
   * Check if context is expired
   */
  isExpired(maxAge: number): boolean {
    return this.getAge() > maxAge;
  }

  /**
   * Upgrade security level
   */
  upgradeSecurityLevel(level: SecurityLevel): SecurityContextEntity {
    return new SecurityContextEntity({
      ...this.data,
      securityLevel: level,
    });
  }

  /**
   * Clone the entity
   */
  clone(): SecurityContextEntity {
    return new SecurityContextEntity({ ...this.data });
  }

  /**
   * Convert to plain object
   */
  toObject(): SecurityContextData {
    return { ...this.data };
  }

  /**
   * Check if two contexts are equal
   */
  equals(other: SecurityContextEntity): boolean {
    return (
      this.data.authenticated === other.data.authenticated &&
      this.data.userId === other.data.userId &&
      this.data.ipAddress === other.data.ipAddress
    );
  }
}
