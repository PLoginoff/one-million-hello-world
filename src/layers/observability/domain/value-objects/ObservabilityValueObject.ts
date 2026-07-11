/**
 * Observability Value Object
 *
 * Immutable value object for the Metrics, logs and traces aggregation layer.
 */

export class ObservabilityValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Observability value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ObservabilityValueObject {
    return new ObservabilityValueObject(value);
  }

  equals(other: ObservabilityValueObject): boolean {
    return other instanceof ObservabilityValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
