/**
 * Request Metadata Value Object
 *
 * Represents metadata for rate limit requests.
 * Immutable value object for tracking request performance.
 */

export interface RequestMetadataData {
  timestamp: number;
  duration: number;
}

export class RequestMetadata {
  readonly data: RequestMetadataData;

  constructor(data: RequestMetadataData) {
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
  update(updates: Partial<RequestMetadataData>): RequestMetadata {
    return new RequestMetadata({ ...this.data, ...updates });
  }

  /**
   * Create a copy
   */
  clone(): RequestMetadata {
    return new RequestMetadata({ ...this.data });
  }

  /**
   * Mark as completed with duration
   */
  markAsCompleted(duration: number): RequestMetadata {
    return this.update({ duration });
  }
}
