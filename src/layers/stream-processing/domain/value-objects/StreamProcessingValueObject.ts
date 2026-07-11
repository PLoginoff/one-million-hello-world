/**
 * StreamProcessing Value Object
 *
 * Immutable value object for the Stream processing abstraction layer.
 */

export class StreamProcessingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('StreamProcessing value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): StreamProcessingValueObject {
    return new StreamProcessingValueObject(value);
  }

  equals(other: StreamProcessingValueObject): boolean {
    return other instanceof StreamProcessingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
