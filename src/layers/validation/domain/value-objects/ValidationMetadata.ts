/**
 * Validation Metadata Value Object
 *
 * Represents metadata for validation operations.
 * Immutable value object for tracking validation performance.
 */

export interface ValidationMetadataData {
  timestamp: number;
  duration: number;
}

export class ValidationMetadata {
  readonly data: ValidationMetadataData;

  constructor(data: ValidationMetadataData) {
    this.data = { ...data };
  }

  /**
   * Get timestamp
   */
  getTimestamp(): number {
    return this.data.timestamp;
  }

  /**
   * Get duration in milliseconds
   */
  getDuration(): number {
    return this.data.duration;
  }

  /**
   * Create a copy with updated values
   */
  update(updates: Partial<ValidationMetadataData>): ValidationMetadata {
    return new ValidationMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): ValidationMetadata {
    return new ValidationMetadata({ ...this.data });
  }

  /**
   * Mark as completed with duration
   */
  markAsCompleted(duration: number): ValidationMetadata {
    return this.update({ duration });
  }
}
