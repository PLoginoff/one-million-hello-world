/**
 * Oauth2 Value Object
 *
 * Immutable value object for the OAuth2 provider integration layer.
 */

export class Oauth2ValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Oauth2 value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): Oauth2ValueObject {
    return new Oauth2ValueObject(value);
  }

  equals(other: Oauth2ValueObject): boolean {
    return other instanceof Oauth2ValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
