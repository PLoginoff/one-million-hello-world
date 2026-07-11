/**
 * Inbox Value Object
 *
 * Immutable value object for the Inbox pattern for idempotent consumers layer.
 */

export class InboxValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Inbox value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): InboxValueObject {
    return new InboxValueObject(value);
  }

  equals(other: InboxValueObject): boolean {
    return other instanceof InboxValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
