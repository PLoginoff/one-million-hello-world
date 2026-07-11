/**
 * JwtValidation Value Object
 *
 * Immutable value object for the JWT token validation layer.
 */

export class JwtValidationValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('JwtValidation value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): JwtValidationValueObject {
    return new JwtValidationValueObject(value);
  }

  equals(other: JwtValidationValueObject): boolean {
    return other instanceof JwtValidationValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
