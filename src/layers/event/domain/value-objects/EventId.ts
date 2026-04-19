/**
 * EventId - Value Object
 * 
 * Represents a unique identifier for an event.
 * Immutable value object with validation.
 */

export class EventId {
  private readonly _value: string;

  constructor(value?: string) {
    this._value = value || this._generate();
    this._validate();
  }

  private _generate(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${randomPart}-${randomPart2}`;
  }

  private _validate(): void {
    if (!this._value || typeof this._value !== 'string') {
      throw new Error('EventId must be a non-empty string');
    }
    if (this._value.length < 10) {
      throw new Error('EventId must be at least 10 characters long');
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: EventId): boolean {
    if (!(other instanceof EventId)) {
      return false;
    }
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }

  static fromString(value: string): EventId {
    return new EventId(value);
  }
}
