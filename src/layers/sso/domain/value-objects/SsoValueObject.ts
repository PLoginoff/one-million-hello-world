/**
 * Sso Value Object
 *
 * Immutable value object for the Single sign-on integration layer.
 */

export class SsoValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Sso value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SsoValueObject {
    return new SsoValueObject(value);
  }

  equals(other: SsoValueObject): boolean {
    return other instanceof SsoValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
