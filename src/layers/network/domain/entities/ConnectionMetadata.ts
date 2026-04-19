/**
 * Connection Metadata Entity
 * 
 * Represents metadata for a network connection including
 * creation time, activity tracking, and statistics.
 */

export class ConnectionMetadata {
  readonly connectionId: string;
  readonly createdAt: number;
  readonly createdBy: string;
  lastActiveAt: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  requestCount: number;
  responseCount: number;
  errorCount: number;
  userContext: Map<string, unknown>;
  tags: Set<string>;

  private constructor(
    connectionId: string,
    createdAt: number,
    createdBy: string,
  ) {
    this.connectionId = connectionId;
    this.createdAt = createdAt;
    this.createdBy = createdBy;
    this.lastActiveAt = createdAt;
    this.totalBytesSent = 0;
    this.totalBytesReceived = 0;
    this.requestCount = 0;
    this.responseCount = 0;
    this.errorCount = 0;
    this.userContext = new Map();
    this.tags = new Set();
  }

  /**
   * Create new connection metadata
   */
  static create(connectionId: string, createdBy: string = 'system'): ConnectionMetadata {
    return new ConnectionMetadata(connectionId, Date.now(), createdBy);
  }

  /**
   * Record activity
   */
  recordActivity(): void {
    this.lastActiveAt = Date.now();
  }

  /**
   * Record data sent
   */
  recordBytesSent(bytes: number): void {
    this.totalBytesSent += bytes;
    this.recordActivity();
  }

  /**
   * Record data received
   */
  recordBytesReceived(bytes: number): void {
    this.totalBytesReceived += bytes;
    this.recordActivity();
  }

  /**
   * Record request
   */
  recordRequest(): void {
    this.requestCount++;
    this.recordActivity();
  }

  /**
   * Record response
   */
  recordResponse(): void {
    this.responseCount++;
    this.recordActivity();
  }

  /**
   * Record error
   */
  recordError(): void {
    this.errorCount++;
    this.recordActivity();
  }

  /**
   * Add user context
   */
  addUserContext(key: string, value: unknown): void {
    this.userContext.set(key, value);
  }

  /**
   * Get user context
   */
  getUserContext(key: string): unknown | undefined {
    return this.userContext.get(key);
  }

  /**
   * Add tag
   */
  addTag(tag: string): void {
    this.tags.add(tag);
  }

  /**
   * Remove tag
   */
  removeTag(tag: string): void {
    this.tags.delete(tag);
  }

  /**
   * Check if has tag
   */
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.tags);
  }

  /**
   * Get age in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Get idle time in milliseconds
   */
  getIdleTime(): number {
    return Date.now() - this.lastActiveAt;
  }

  /**
   * Check if is idle
   */
  isIdle(maxIdleTime: number): boolean {
    return this.getIdleTime() > maxIdleTime;
  }

  /**
   * Get total bytes transferred
   */
  getTotalBytes(): number {
    return this.totalBytesSent + this.totalBytesReceived;
  }

  /**
   * Get error rate
   */
  getErrorRate(): number {
    const total = this.requestCount + this.responseCount;
    if (total === 0) return 0;
    return this.errorCount / total;
  }

  /**
   * Create a copy of this metadata
   */
  clone(): ConnectionMetadata {
    const cloned = new ConnectionMetadata(this.connectionId, this.createdAt, this.createdBy);
    cloned.lastActiveAt = this.lastActiveAt;
    cloned.totalBytesSent = this.totalBytesSent;
    cloned.totalBytesReceived = this.totalBytesReceived;
    cloned.requestCount = this.requestCount;
    cloned.responseCount = this.responseCount;
    cloned.errorCount = this.errorCount;
    cloned.userContext = new Map(this.userContext);
    cloned.tags = new Set(this.tags);
    return cloned;
  }

  /**
   * Convert to plain object
   */
  toObject(): {
    connectionId: string;
    createdAt: number;
    createdBy: string;
    lastActiveAt: number;
    totalBytesSent: number;
    totalBytesReceived: number;
    requestCount: number;
    responseCount: number;
    errorCount: number;
    userContext: Record<string, unknown>;
    tags: string[];
  } {
    return {
      connectionId: this.connectionId,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      lastActiveAt: this.lastActiveAt,
      totalBytesSent: this.totalBytesSent,
      totalBytesReceived: this.totalBytesReceived,
      requestCount: this.requestCount,
      responseCount: this.responseCount,
      errorCount: this.errorCount,
      userContext: Object.fromEntries(this.userContext),
      tags: this.getTags(),
    };
  }
}
