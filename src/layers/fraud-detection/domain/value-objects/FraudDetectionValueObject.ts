/**
 * FraudDetection Value Object
 *
 * Immutable value object for the Fraud detection engine layer.
 */

export class FraudDetectionValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('FraudDetection value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): FraudDetectionValueObject {
    return new FraudDetectionValueObject(value);
  }

  equals(other: FraudDetectionValueObject): boolean {
    return other instanceof FraudDetectionValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
