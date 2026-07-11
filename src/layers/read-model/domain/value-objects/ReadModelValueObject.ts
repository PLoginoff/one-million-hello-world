/**
 * ReadModel Value Object
 *
 * Immutable value object for the Read model projections layer.
 */

export class ReadModelValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ReadModel value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ReadModelValueObject {
    return new ReadModelValueObject(value);
  }

  equals(other: ReadModelValueObject): boolean {
    return other instanceof ReadModelValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
