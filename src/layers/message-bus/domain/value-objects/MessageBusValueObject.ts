/**
 * MessageBus Value Object
 *
 * Immutable value object for the Enterprise message bus and event streaming layer.
 */

export class MessageBusValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('MessageBus value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): MessageBusValueObject {
    return new MessageBusValueObject(value);
  }

  equals(other: MessageBusValueObject): boolean {
    return other instanceof MessageBusValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
