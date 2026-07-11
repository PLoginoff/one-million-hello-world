/**
 * Outbox Value Object
 *
 * Immutable value object for the Transactional outbox pattern layer.
 */

export class OutboxValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Outbox value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): OutboxValueObject {
    return new OutboxValueObject(value);
  }

  equals(other: OutboxValueObject): boolean {
    return other instanceof OutboxValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
