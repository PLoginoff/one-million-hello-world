/**
 * EventPayload - Value Object
 * 
 * Represents the data payload of an event.
 * Immutable value object with type safety and validation.
 */

export class EventPayload<T = unknown> {
  private readonly _data: T;
  private readonly _schema?: object;
  private readonly _contentType: string;

  constructor(data: T, options: { schema?: object; contentType?: string } = {}) {
    this._data = data;
    this._schema = options.schema;
    this._contentType = options.contentType || 'application/json';
    this._validate();
  }

  private _validate(): void {
    if (this._data === undefined) {
      throw new Error('EventPayload: data cannot be undefined');
    }
    if (this._contentType && typeof this._contentType !== 'string') {
      throw new Error('EventPayload: contentType must be a string');
    }
  }

  get data(): T {
    return this._data;
  }

  get schema(): object | undefined {
    return this._schema;
  }

  get contentType(): string {
    return this._contentType;
  }

  isEmpty(): boolean {
    if (this._data === null || this._data === undefined) {
      return true;
    }
    if (typeof this._data === 'string') {
      return this._data.length === 0;
    }
    if (Array.isArray(this._data)) {
      return this._data.length === 0;
    }
    if (typeof this._data === 'object') {
      return Object.keys(this._data).length === 0;
    }
    return false;
  }

  getSize(): number {
    return JSON.stringify(this._data).length;
  }

  getPath(path: string): unknown {
    const keys = path.split('.');
    let current: any = this._data;
    
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  equals(other: EventPayload<T>): boolean {
    if (!(other instanceof EventPayload)) {
      return false;
    }
    return JSON.stringify(this._data) === JSON.stringify(other._data);
  }

  toJSON(): T {
    return this._data;
  }

  toString(): string {
    return JSON.stringify(this._data);
  }

  static fromJSON<T>(data: T): EventPayload<T> {
    return new EventPayload(data);
  }

  static empty<T>(): EventPayload<T> {
    return new EventPayload({} as T);
  }

  static fromString(jsonString: string): EventPayload {
    try {
      const data = JSON.parse(jsonString);
      return new EventPayload(data);
    } catch (error) {
      throw new Error('EventPayload: invalid JSON string');
    }
  }
}
