/**
 * EventType - Value Object
 * 
 * Represents the type/category of an event.
 * Immutable value object with validation and categorization.
 */

export class EventType {
  private static readonly VALID_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
  private static readonly MAX_LENGTH = 100;

  private readonly _value: string;
  private readonly _category: string;
  private readonly _subcategory?: string;

  constructor(value: string) {
    this._value = value.toLowerCase().trim();
    this._validate();
    this._parseCategory();
  }

  private _validate(): void {
    if (!this._value || typeof this._value !== 'string') {
      throw new Error('EventType must be a non-empty string');
    }
    if (this._value.length > EventType.MAX_LENGTH) {
      throw new Error(`EventType must not exceed ${EventType.MAX_LENGTH} characters`);
    }
    if (!EventType.VALID_PATTERN.test(this._value)) {
      throw new Error('EventType must match pattern: lowercase letters, numbers, hyphens, and dots');
    }
  }

  private _parseCategory(): void {
    const parts = this._value.split('.');
    this._category = parts[0];
    this._subcategory = parts.length > 1 ? parts.slice(1).join('.') : undefined;
  }

  get value(): string {
    return this._value;
  }

  get category(): string {
    return this._category;
  }

  get subcategory(): string | undefined {
    return this._subcategory;
  }

  equals(other: EventType): boolean {
    if (!(other instanceof EventType)) {
      return false;
    }
    return this._value === other._value;
  }

  isCategory(category: string): boolean {
    return this._category === category;
  }

  matches(pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(this._value);
  }

  toString(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }

  static fromString(value: string): EventType {
    return new EventType(value);
  }

  static create(category: string, subcategory?: string): EventType {
    if (subcategory) {
      return new EventType(`${category}.${subcategory}`);
    }
    return new EventType(category);
  }
}
