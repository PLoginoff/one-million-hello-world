/**
 * PerformanceTesting Value Object
 *
 * Immutable value object for the Performance and load testing layer.
 */

export class PerformanceTestingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('PerformanceTesting value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): PerformanceTestingValueObject {
    return new PerformanceTestingValueObject(value);
  }

  equals(other: PerformanceTestingValueObject): boolean {
    return other instanceof PerformanceTestingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
