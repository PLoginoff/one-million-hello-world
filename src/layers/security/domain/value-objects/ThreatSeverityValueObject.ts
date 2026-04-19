/**
 * Threat Severity Value Object
 * 
 * Represents threat severity with comparison capabilities.
 */

import { ThreatSeverity } from '../../types/security-types';

export class ThreatSeverityValueObject {
  readonly value: ThreatSeverity;
  readonly priority: number;

  private constructor(value: ThreatSeverity) {
    this.value = value;
    this.priority = this.getPriority(value);
  }

  /**
   * Create threat severity value object
   */
  static create(value: ThreatSeverity): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(value);
  }

  /**
   * Create low severity
   */
  static low(): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(ThreatSeverity.LOW);
  }

  /**
   * Create medium severity
   */
  static medium(): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(ThreatSeverity.MEDIUM);
  }

  /**
   * Create high severity
   */
  static high(): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(ThreatSeverity.HIGH);
  }

  /**
   * Create critical severity
   */
  static critical(): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(ThreatSeverity.CRITICAL);
  }

  /**
   * Check if severity is low
   */
  isLow(): boolean {
    return this.value === ThreatSeverity.LOW;
  }

  /**
   * Check if severity is medium
   */
  isMedium(): boolean {
    return this.value === ThreatSeverity.MEDIUM;
  }

  /**
   * Check if severity is high
   */
  isHigh(): boolean {
    return this.value === ThreatSeverity.HIGH;
  }

  /**
   * Check if severity is critical
   */
  isCritical(): boolean {
    return this.value === ThreatSeverity.CRITICAL;
  }

  /**
   * Check if severity requires immediate action
   */
  requiresImmediateAction(): boolean {
    return this.isHigh() || this.isCritical();
  }

  /**
   * Check if severity is at least minimum
   */
  isAtLeast(minimum: ThreatSeverityValueObject): boolean {
    return this.priority >= minimum.priority;
  }

  /**
   * Clone the value object
   */
  clone(): ThreatSeverityValueObject {
    return new ThreatSeverityValueObject(this.value);
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check if two severities are equal
   */
  equals(other: ThreatSeverityValueObject): boolean {
    return this.value === other.value;
  }

  private getPriority(severity: ThreatSeverity): number {
    const priorities: Record<ThreatSeverity, number> = {
      [ThreatSeverity.LOW]: 0,
      [ThreatSeverity.MEDIUM]: 1,
      [ThreatSeverity.HIGH]: 2,
      [ThreatSeverity.CRITICAL]: 3,
    };
    return priorities[severity];
  }
}
