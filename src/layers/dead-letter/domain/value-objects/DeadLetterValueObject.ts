/**
 * DeadLetter Value Object
 *
 * Immutable value object for the Dead letter queue management layer.
 */

export class DeadLetterValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DeadLetter value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DeadLetterValueObject {
    return new DeadLetterValueObject(value);
  }

  equals(other: DeadLetterValueObject): boolean {
    return other instanceof DeadLetterValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
