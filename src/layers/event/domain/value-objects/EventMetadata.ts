/**
 * EventMetadata - Value Object
 * 
 * Contains metadata about an event (timestamp, source, correlation ID, etc.).
 * Immutable value object for event context and tracing.
 */

export interface EventMetadataOptions {
  timestamp?: Date;
  source?: string;
  correlationId?: string;
  causationId?: string;
  userId?: string;
  version?: number;
  tags?: Record<string, string>;
}

export class EventMetadata {
  private readonly _timestamp: Date;
  private readonly _source: string;
  private readonly _correlationId: string;
  private readonly _causationId?: string;
  private readonly _userId?: string;
  private readonly _version: number;
  private readonly _tags: Record<string, string>;

  constructor(options: EventMetadataOptions = {}) {
    this._timestamp = options.timestamp || new Date();
    this._source = options.source || 'unknown';
    this._correlationId = options.correlationId || this._generateCorrelationId();
    this._causationId = options.causationId;
    this._userId = options.userId;
    this._version = options.version || 1;
    this._tags = options.tags || {};
    this._validate();
  }

  private _generateCorrelationId(): string {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
  }

  private _validate(): void {
    if (!(this._timestamp instanceof Date) || isNaN(this._timestamp.getTime())) {
      throw new Error('EventMetadata: timestamp must be a valid Date');
    }
    if (!this._source || typeof this._source !== 'string') {
      throw new Error('EventMetadata: source must be a non-empty string');
    }
    if (!this._correlationId || typeof this._correlationId !== 'string') {
      throw new Error('EventMetadata: correlationId must be a non-empty string');
    }
    if (this._version < 1) {
      throw new Error('EventMetadata: version must be at least 1');
    }
  }

  get timestamp(): Date {
    return new Date(this._timestamp);
  }

  get source(): string {
    return this._source;
  }

  get correlationId(): string {
    return this._correlationId;
  }

  get causationId(): string | undefined {
    return this._causationId;
  }

  get userId(): string | undefined {
    return this._userId;
  }

  get version(): number {
    return this._version;
  }

  get tags(): Record<string, string> {
    return { ...this._tags };
  }

  getTag(key: string): string | undefined {
    return this._tags[key];
  }

  hasTag(key: string): boolean {
    return key in this._tags;
  }

  withCausationId(causationId: string): EventMetadata {
    return new EventMetadata({
      ...this._toOptions(),
      causationId,
    });
  }

  withTag(key: string, value: string): EventMetadata {
    return new EventMetadata({
      ...this._toOptions(),
      tags: { ...this._tags, [key]: value },
    });
  }

  private _toOptions(): EventMetadataOptions {
    return {
      timestamp: this._timestamp,
      source: this._source,
      correlationId: this._correlationId,
      causationId: this._causationId,
      userId: this._userId,
      version: this._version,
      tags: { ...this._tags },
    };
  }

  equals(other: EventMetadata): boolean {
    if (!(other instanceof EventMetadata)) {
      return false;
    }
    return (
      this._timestamp.getTime() === other._timestamp.getTime() &&
      this._source === other._source &&
      this._correlationId === other._correlationId &&
      this._causationId === other._causationId &&
      this._userId === other._userId &&
      this._version === other._version
    );
  }

  toJSON(): object {
    return {
      timestamp: this._timestamp.toISOString(),
      source: this._source,
      correlationId: this._correlationId,
      causationId: this._causationId,
      userId: this._userId,
      version: this._version,
      tags: this._tags,
    };
  }

  static fromJSON(json: any): EventMetadata {
    return new EventMetadata({
      timestamp: json.timestamp ? new Date(json.timestamp) : undefined,
      source: json.source,
      correlationId: json.correlationId,
      causationId: json.causationId,
      userId: json.userId,
      version: json.version,
      tags: json.tags,
    });
  }

  static create(source: string): EventMetadata {
    return new EventMetadata({ source });
  }
}
