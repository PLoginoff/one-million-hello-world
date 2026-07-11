/**
 * PropertyTesting Value Object
 *
 * Immutable value object for the Property-based testing layer.
 */

export class PropertyTestingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('PropertyTesting value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): PropertyTestingValueObject {
    return new PropertyTestingValueObject(value);
  }

  equals(other: PropertyTestingValueObject): boolean {
    return other instanceof PropertyTestingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
