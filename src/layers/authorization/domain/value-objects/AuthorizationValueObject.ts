/**
 * Authorization Value Object
 *
 * Immutable value object for the Authorization and policy enforcement layer.
 */

export class AuthorizationValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Authorization value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): AuthorizationValueObject {
    return new AuthorizationValueObject(value);
  }

  equals(other: AuthorizationValueObject): boolean {
    return other instanceof AuthorizationValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
