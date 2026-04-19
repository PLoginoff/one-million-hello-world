/**
 * Threat Entity
 * 
 * Represents a detected security threat with metadata.
 */

import { ThreatType, ThreatSeverity } from '../../types/security-types';

export interface ThreatData {
  type: ThreatType;
  severity: ThreatSeverity;
  description: string;
  sourceIp: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class ThreatEntity {
  readonly data: ThreatData;

  private constructor(data: ThreatData) {
    this.data = { ...data };
  }

  /**
   * Create threat entity
   */
  static create(data: ThreatData): ThreatEntity {
    return new ThreatEntity(data);
  }

  /**
   * Create threat from basic info
   */
  static fromBasic(
    type: ThreatType,
    severity: ThreatSeverity,
    description: string,
    sourceIp: string,
    metadata?: Record<string, any>
  ): ThreatEntity {
    return new ThreatEntity({
      type,
      severity,
      description,
      sourceIp,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Check if threat is critical
   */
  isCritical(): boolean {
    return this.data.severity === ThreatSeverity.CRITICAL;
  }

  /**
   * Check if threat is high severity
   */
  isHigh(): boolean {
    return this.data.severity === ThreatSeverity.HIGH;
  }

  /**
   * Check if threat is medium severity
   */
  isMedium(): boolean {
    return this.data.severity === ThreatSeverity.MEDIUM;
  }

  /**
   * Check if threat is low severity
   */
  isLow(): boolean {
    return this.data.severity === ThreatSeverity.LOW;
  }

  /**
   * Check if threat requires immediate action
   */
  requiresImmediateAction(): boolean {
    return this.isCritical() || this.isHigh();
  }

  /**
   * Get threat age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.data.timestamp;
  }

  /**
   * Check if threat is recent (within specified time window)
   */
  isRecent(timeWindow: number): boolean {
    return this.getAge() < timeWindow;
  }

  /**
   * Get metadata value
   */
  getMetadata(key: string): any | undefined {
    return this.data.metadata?.[key];
  }

  /**
   * Clone the entity
   */
  clone(): ThreatEntity {
    return new ThreatEntity({
      ...this.data,
      metadata: this.data.metadata ? { ...this.data.metadata } : undefined,
    });
  }

  /**
   * Convert to plain object
   */
  toObject(): ThreatData {
    return {
      ...this.data,
      metadata: this.data.metadata ? { ...this.data.metadata } : undefined,
    };
  }

  /**
   * Check if two threats are equal
   */
  equals(other: ThreatEntity): boolean {
    return (
      this.data.type === other.data.type &&
      this.data.sourceIp === other.data.sourceIp &&
      this.data.timestamp === other.data.timestamp
    );
  }
}
