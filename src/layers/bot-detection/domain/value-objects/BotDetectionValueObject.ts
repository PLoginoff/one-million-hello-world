/**
 * BotDetection Value Object
 *
 * Immutable value object for the Bot detection and traffic filtering layer.
 */

export class BotDetectionValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('BotDetection value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): BotDetectionValueObject {
    return new BotDetectionValueObject(value);
  }

  equals(other: BotDetectionValueObject): boolean {
    return other instanceof BotDetectionValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
