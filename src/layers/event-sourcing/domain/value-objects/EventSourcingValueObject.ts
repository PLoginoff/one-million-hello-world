/**
 * EventSourcing Value Object
 *
 * Immutable value object for the Event sourcing and event store layer.
 */

export class EventSourcingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('EventSourcing value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): EventSourcingValueObject {
    return new EventSourcingValueObject(value);
  }

  equals(other: EventSourcingValueObject): boolean {
    return other instanceof EventSourcingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
