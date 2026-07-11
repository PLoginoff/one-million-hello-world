/**
 * IdentityProvider Value Object
 *
 * Immutable value object for the Identity provider abstraction layer.
 */

export class IdentityProviderValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('IdentityProvider value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): IdentityProviderValueObject {
    return new IdentityProviderValueObject(value);
  }

  equals(other: IdentityProviderValueObject): boolean {
    return other instanceof IdentityProviderValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
