/**
 * Throttling Value Object
 *
 * Immutable value object for the Throttling and quota management layer.
 */

export class ThrottlingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Throttling value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ThrottlingValueObject {
    return new ThrottlingValueObject(value);
  }

  equals(other: ThrottlingValueObject): boolean {
    return other instanceof ThrottlingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
