/**
 * Encryption Value Object
 *
 * Immutable value object for the Encryption at rest and in transit layer.
 */

export class EncryptionValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Encryption value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): EncryptionValueObject {
    return new EncryptionValueObject(value);
  }

  equals(other: EncryptionValueObject): boolean {
    return other instanceof EncryptionValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
