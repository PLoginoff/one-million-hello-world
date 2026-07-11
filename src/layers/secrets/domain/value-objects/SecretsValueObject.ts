/**
 * Secrets Value Object
 *
 * Immutable value object for the Secrets management and vault abstraction layer.
 */

export class SecretsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Secrets value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SecretsValueObject {
    return new SecretsValueObject(value);
  }

  equals(other: SecretsValueObject): boolean {
    return other instanceof SecretsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
