/**
 * Identity Value Object
 *
 * Immutable value object for the Identity and user management layer.
 */

export class IdentityValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Identity value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): IdentityValueObject {
    return new IdentityValueObject(value);
  }

  equals(other: IdentityValueObject): boolean {
    return other instanceof IdentityValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
