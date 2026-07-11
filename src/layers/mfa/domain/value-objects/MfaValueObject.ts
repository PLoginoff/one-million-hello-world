/**
 * Mfa Value Object
 *
 * Immutable value object for the Multi-factor authentication layer.
 */

export class MfaValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Mfa value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): MfaValueObject {
    return new MfaValueObject(value);
  }

  equals(other: MfaValueObject): boolean {
    return other instanceof MfaValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
