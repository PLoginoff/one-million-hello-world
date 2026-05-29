/**
 * Rate Limit Request Entity
 *
 * Represents a rate limit request with metadata.
 * Immutable entity that stores rate limit request data with metrics.
 */

import { RequestMetadata } from '../value-objects/RequestMetadata';

export class RateLimitRequestEntity {
  readonly requestId: string;
  readonly clientId: string;
  readonly resource: string;
  readonly metadata: RequestMetadata;
  readonly parameters: Record<string, unknown>;
  readonly allowed: boolean;
  readonly reason?: string;

  constructor(
    requestId: string,
    clientId: string,
    resource: string,
    allowed: boolean,
    metadata?: RequestMetadata,
    parameters?: Record<string, unknown>,
    reason?: string,
  ) {
    this.requestId = requestId;
    this.clientId = clientId;
    this.resource = resource;
    this.allowed = allowed;
    this.metadata = metadata || this._createDefaultMetadata();
    this.parameters = parameters || {};
    this.reason = reason;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    return this.allowed;
  }

  /**
   * Check if request is denied
   */
  isDenied(): boolean {
    return !this.allowed;
  }

  /**
   * Get request timestamp
   */
  getTimestamp(): number {
    return this.metadata.getTimestamp();
  }

  /**
   * Get request duration
   */
  getDuration(): number {
    return this.metadata.getDuration();
  }

  /**
   * Create a copy with allowed status
   */
  withAllowed(allowed: boolean, reason?: string): RateLimitRequestEntity {
    return new RateLimitRequestEntity(
      this.requestId,
      this.clientId,
      this.resource,
      allowed,
      this.metadata,
      this.parameters,
      reason,
    );
  }

  /**
   * Create a copy with updated metadata
   */
  withMetadata(updates: Partial<import('./../value-objects/RequestMetadata').RequestMetadataData>): RateLimitRequestEntity {
    return new RateLimitRequestEntity(
      this.requestId,
      this.clientId,
      this.resource,
      this.allowed,
      this.metadata.update(updates),
      this.parameters,
      this.reason,
    );
  }

  /**
   * Create a copy
   */
  clone(): RateLimitRequestEntity {
    return new RateLimitRequestEntity(
      this.requestId,
      this.clientId,
      this.resource,
      this.allowed,
      this.metadata.clone(),
      { ...this.parameters },
      this.reason,
    );
  }

  private _createDefaultMetadata(): RequestMetadata {
    return new RequestMetadata({
      timestamp: Date.now(),
      duration: 0,
    });
  }
}
