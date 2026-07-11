/**
 * Audit Value Object
 *
 * Immutable value object for the Audit logging and compliance tracking layer.
 */

export class AuditValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Audit value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): AuditValueObject {
    return new AuditValueObject(value);
  }

  equals(other: AuditValueObject): boolean {
    return other instanceof AuditValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
