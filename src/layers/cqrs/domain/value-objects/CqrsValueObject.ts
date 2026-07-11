/**
 * Cqrs Value Object
 *
 * Immutable value object for the Command Query Responsibility Segregation layer.
 */

export class CqrsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Cqrs value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): CqrsValueObject {
    return new CqrsValueObject(value);
  }

  equals(other: CqrsValueObject): boolean {
    return other instanceof CqrsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
