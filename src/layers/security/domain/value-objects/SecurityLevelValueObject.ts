/**
 * Security Level Value Object
 * 
 * Represents security level with comparison capabilities.
 */

import { SecurityLevel } from '../../types/security-types';

export class SecurityLevelValueObject {
  readonly value: SecurityLevel;
  readonly priority: number;

  private constructor(value: SecurityLevel) {
    this.value = value;
    this.priority = this.getPriority(value);
  }

  /**
   * Create security level value object
   */
  static create(value: SecurityLevel): SecurityLevelValueObject {
    return new SecurityLevelValueObject(value);
  }

  /**
   * Create low security level
   */
  static low(): SecurityLevelValueObject {
    return new SecurityLevelValueObject(SecurityLevel.LOW);
  }

  /**
   * Create medium security level
   */
  static medium(): SecurityLevelValueObject {
    return new SecurityLevelValueObject(SecurityLevel.MEDIUM);
  }

  /**
   * Create high security level
   */
  static high(): SecurityLevelValueObject {
    return new SecurityLevelValueObject(SecurityLevel.HIGH);
  }

  /**
   * Create critical security level
   */
  static critical(): SecurityLevelValueObject {
    return new SecurityLevelValueObject(SecurityLevel.CRITICAL);
  }

  /**
   * Check if level is low
   */
  isLow(): boolean {
    return this.value === SecurityLevel.LOW;
  }

  /**
   * Check if level is medium
   */
  isMedium(): boolean {
    return this.value === SecurityLevel.MEDIUM;
  }

  /**
   * Check if level is high
   */
  isHigh(): boolean {
    return this.value === SecurityLevel.HIGH;
  }

  /**
   * Check if level is critical
   */
  isCritical(): boolean {
    return this.value === SecurityLevel.CRITICAL;
  }

  /**
   * Check if level is at least minimum
   */
  isAtLeast(minimum: SecurityLevelValueObject): boolean {
    return this.priority >= minimum.priority;
  }

  /**
   * Check if level is at most maximum
   */
  isAtMost(maximum: SecurityLevelValueObject): boolean {
    return this.priority <= maximum.priority;
  }

  /**
   * Check if level is between min and max (inclusive)
   */
  isBetween(min: SecurityLevelValueObject, max: SecurityLevelValueObject): boolean {
    return this.priority >= min.priority && this.priority <= max.priority;
  }

  /**
   * Clone the value object
   */
  clone(): SecurityLevelValueObject {
    return new SecurityLevelValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two levels are equal
   */
  equals(other: SecurityLevelValueObject): boolean {
    return this.value === other.value;
  }

  private getPriority(level: SecurityLevel): number {
    const priorities: Record<SecurityLevel, number> = {
      [SecurityLevel.LOW]: 0,
      [SecurityLevel.MEDIUM]: 1,
      [SecurityLevel.HIGH]: 2,
      [SecurityLevel.CRITICAL]: 3,
    };
    return priorities[level];
  }
}
