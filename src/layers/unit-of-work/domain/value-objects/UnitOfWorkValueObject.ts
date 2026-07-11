/**
 * UnitOfWork Value Object
 *
 * Immutable value object for the Unit of work pattern layer.
 */

export class UnitOfWorkValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('UnitOfWork value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): UnitOfWorkValueObject {
    return new UnitOfWorkValueObject(value);
  }

  equals(other: UnitOfWorkValueObject): boolean {
    return other instanceof UnitOfWorkValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
