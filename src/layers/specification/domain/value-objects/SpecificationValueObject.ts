/**
 * Specification Value Object
 *
 * Immutable value object for the Specification pattern layer layer.
 */

export class SpecificationValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Specification value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SpecificationValueObject {
    return new SpecificationValueObject(value);
  }

  equals(other: SpecificationValueObject): boolean {
    return other instanceof SpecificationValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
