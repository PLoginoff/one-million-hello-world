/**
 * DdosProtection Value Object
 *
 * Immutable value object for the DDoS protection layer layer.
 */

export class DdosProtectionValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DdosProtection value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DdosProtectionValueObject {
    return new DdosProtectionValueObject(value);
  }

  equals(other: DdosProtectionValueObject): boolean {
    return other instanceof DdosProtectionValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
