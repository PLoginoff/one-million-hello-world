/**
 * WriteModel Value Object
 *
 * Immutable value object for the Write model and aggregate persistence layer.
 */

export class WriteModelValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('WriteModel value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): WriteModelValueObject {
    return new WriteModelValueObject(value);
  }

  equals(other: WriteModelValueObject): boolean {
    return other instanceof WriteModelValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
