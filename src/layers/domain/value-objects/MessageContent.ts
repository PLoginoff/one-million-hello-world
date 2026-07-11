import { ValueObject } from '../types/domain-types';

export class MessageContent implements ValueObject {
  readonly value: string;
  readonly maxLength: number = 1000;

  private constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Message content cannot be empty');
    }
    if (value.length > this.maxLength) {
      throw new Error(`Message content cannot exceed ${this.maxLength} characters`);
    }
    this.value = value;
  }

  static create(value: string): MessageContent {
    return new MessageContent(value);
  }

  equals(other: ValueObject): boolean {
    if (!(other instanceof MessageContent)) {
      return false;
    }
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  append(suffix: string): MessageContent {
    return new MessageContent(`${this.value}${suffix}`);
  }

  truncate(length: number): MessageContent {
    return new MessageContent(this.value.substring(0, length));
  }
}
