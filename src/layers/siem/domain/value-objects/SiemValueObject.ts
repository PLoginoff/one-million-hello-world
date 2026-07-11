/**
 * Siem Value Object
 *
 * Immutable value object for the Security information and event management layer.
 */

export class SiemValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Siem value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SiemValueObject {
    return new SiemValueObject(value);
  }

  equals(other: SiemValueObject): boolean {
    return other instanceof SiemValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
