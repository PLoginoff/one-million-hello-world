/**
 * DistributedTracing Value Object
 *
 * Immutable value object for the Distributed tracing with OpenTelemetry layer.
 */

export class DistributedTracingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DistributedTracing value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DistributedTracingValueObject {
    return new DistributedTracingValueObject(value);
  }

  equals(other: DistributedTracingValueObject): boolean {
    return other instanceof DistributedTracingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
